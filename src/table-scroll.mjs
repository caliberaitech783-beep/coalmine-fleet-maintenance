// Middle-button browser auto-scroll follows the cursor in both axes.
// Keep normal wheel, touch and scrollbar scrolling, and middle-click links.
export function preventTableAutoScroll(event) {
  if (event.button !== 1 || !event.target?.closest?.('.scroll')) return;
  if (event.target.closest('a,button,input,select,textarea')) return;
  event.preventDefault();
}
