// KORbuild · send-appointment-reminders
//
// Scans every company's configuracoes_lembrete and, for each appointment
// falling inside that company's horas_antes window that doesn't already
// have a 'enviado' row in lembretes_enviados, sends a reminder email and
// logs the outcome. Meant to run on a schedule (every 15-30min) — see the
// deployment note in the project summary for how that schedule is wired up
// (intentionally not done from this function itself).
//
// Uses the service role key, so it bypasses RLS by design: this is a
// trusted background job, not a request made on behalf of a signed-in user.
//
// Safe to invoke with no HOSTINGER_MAIL_API_KEY/HOSTINGER_MAILBOX_ID set:
// HostingerEmailProvider.send() resolves to { success:false, error } instead
// of throwing, so a missing key shows up as controlled 'falhou' rows in
// lembretes_enviados, not a crashed/timed-out function.
//
// Provider note: this used to call Resend. resend-provider.ts is still in
// the repo (unused) in case we switch back; only the import/instantiation
// below changed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { EmailProvider } from './email-provider.ts';
import { HostingerEmailProvider } from './hostinger-provider.ts';

interface ReminderConfig {
  empresa_id: string;
  canal: string;
  horas_antes: number;
  template_assunto: string;
  template_corpo: string;
  ativo: boolean;
}

interface AppointmentRow {
  id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  status: string;
  clientes: { nome: string; email: string } | null;
  colaboradores: { name: string } | null;
  servicos_catalogo: { nome: string } | null;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

Deno.serve(async (_req: Request) => {
  const summary = {
    checked_companies: 0,
    candidates: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[]
  };

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in the function environment' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const emailProvider: EmailProvider = new HostingerEmailProvider(
      Deno.env.get('HOSTINGER_MAIL_API_KEY'),
      Deno.env.get('HOSTINGER_MAILBOX_ID'),
      Deno.env.get('REMINDER_FROM_NAME') || 'KORbuild'
    );

    const { data: configs, error: configError } = await supabase
      .from('configuracoes_lembrete')
      .select('empresa_id, canal, horas_antes, template_assunto, template_corpo, ativo')
      .eq('ativo', true)
      .eq('canal', 'email');

    if (configError) throw configError;

    const reminderConfigs = (configs ?? []) as ReminderConfig[];
    summary.checked_companies = reminderConfigs.length;

    const now = new Date();
    const todayIso = now.toISOString().slice(0, 10);

    for (const config of reminderConfigs) {
      const windowEnd = new Date(now.getTime() + config.horas_antes * 3600 * 1000);
      const windowEndDateIso = windowEnd.toISOString().slice(0, 10);

      const { data: appointments, error: apptError } = await supabase
        .from('agendamentos_servico')
        .select('id, data, hora_inicio, hora_fim, status, clientes(nome, email), colaboradores(name), servicos_catalogo(nome)')
        .eq('empresa_id', config.empresa_id)
        .in('status', ['agendado', 'confirmado'])
        .gte('data', todayIso)
        .lte('data', windowEndDateIso);

      if (apptError) {
        summary.errors.push(`empresa ${config.empresa_id}: ${apptError.message}`);
        continue;
      }

      for (const appt of (appointments ?? []) as unknown as AppointmentRow[]) {
        const apptStart = new Date(`${appt.data}T${appt.hora_inicio}`);
        if (apptStart.getTime() > windowEnd.getTime() || apptStart.getTime() < now.getTime()) continue;

        const { data: alreadySent, error: existingError } = await supabase
          .from('lembretes_enviados')
          .select('id')
          .eq('agendamento_id', appt.id)
          .eq('canal', 'email')
          .eq('status_envio', 'enviado')
          .maybeSingle();

        if (existingError) {
          summary.errors.push(`agendamento ${appt.id}: ${existingError.message}`);
          continue;
        }
        if (alreadySent) continue;

        summary.candidates++;

        const vars = {
          cliente_nome: appt.clientes?.nome ?? '',
          data: formatDate(appt.data),
          hora: formatTime(appt.hora_inicio),
          servico_nome: appt.servicos_catalogo?.nome ?? '',
          colaborador_nome: appt.colaboradores?.name ?? ''
        };

        const subject = renderTemplate(config.template_assunto, vars);
        const body = renderTemplate(config.template_corpo, vars);

        const result = appt.clientes?.email
          ? await emailProvider.send(appt.clientes.email, subject, body)
          : { success: false, error: 'customer has no email on file' };

        if (result.success) summary.sent++;
        else summary.failed++;

        const { error: logError } = await supabase.from('lembretes_enviados').insert({
          agendamento_id: appt.id,
          canal: 'email',
          status_envio: result.success ? 'enviado' : 'falhou',
          enviado_em: result.success ? new Date().toISOString() : null,
          erro_detalhe: result.success ? null : result.error,
          provedor_message_id: result.success ? result.messageId ?? null : null
        });

        if (logError) summary.errors.push(`log agendamento ${appt.id}: ${logError.message}`);
      }
    }

    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[send-appointment-reminders] unhandled error', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown error', ...summary }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
