(function(){
  const select = document.getElementById('dashboard-switcher');
  if (!select) return;
  select.addEventListener('change', () => { location.href = select.value; });
})();
