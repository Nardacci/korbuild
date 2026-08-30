/**
 * KORbuild Auth Service
 * Centralizes authentication only.
 * It does not provision companies, manage subscriptions or control billing.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://nowbohxeqwlddbfnukva.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_OTGYzEhQxckBa_8Xqu4Uog_Dm3RmTtD';
  let client = null;

  function getClient() {
    if (!global.supabase) throw new Error('Supabase client library is not loaded.');
    if (!client) client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  function getSignupRedirectUrl() {
    return new URL('signup-complete.html', global.location.href).toString();
  }

  async function signUp({ email, password, fullName, companyName }) {
    const { data, error } = await getClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getSignupRedirectUrl(),
        data: {
          full_name: fullName,
          company_name: companyName
        }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signIn({ email, password }) {
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw error;
  }

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function getUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error) throw error;
    return data.user;
  }

  global.KORbuildAuth = Object.freeze({ signUp, signIn, signOut, getSession, getUser });
})(window);