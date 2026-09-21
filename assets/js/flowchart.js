const header = document.querySelector('.site-header');
const menu = document.querySelector('.menu-button');
menu?.addEventListener('click', () => {
  const open = header.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', String(open));
});

const nodes = [...document.querySelectorAll('[data-node]')];
const reset = document.querySelector('#resetMap');
nodes.forEach((node) => node.addEventListener('click', () => {
  nodes.forEach((item) => item.classList.toggle('selected', item === node));
}));
reset?.addEventListener('click', () => nodes.forEach((node) => node.classList.remove('selected')));
