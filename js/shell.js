(function initShell(){
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const menuToggle = document.getElementById('menuToggle');
  if(!sidebar || !menuToggle) return;

  function openSidebar(){
    sidebar.classList.add('open');
    sidebarBackdrop?.classList.add('open');
    sidebarBackdrop?.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar(){
    sidebar.classList.remove('open');
    sidebarBackdrop?.classList.remove('open');
    sidebarBackdrop?.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', () => {
    if(sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  sidebarBackdrop?.addEventListener('click', closeSidebar);
  window.addEventListener('keydown', event => {
    if(event.key === 'Escape') closeSidebar();
  });
  window.addEventListener('resize', () => {
    if(window.innerWidth > 900) closeSidebar();
  });

  sidebar.querySelectorAll('a.nav-item').forEach(link => {
    link.addEventListener('click', () => closeSidebar());
  });

  const page = document.body.dataset.page;
  if(page){
    document.querySelectorAll('[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  }
})();
