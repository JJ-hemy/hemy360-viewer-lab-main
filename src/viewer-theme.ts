/** A presentation theme only: model state and geometry are independent of it. */
type ViewerTheme = "classic" | "hemy";
const storageKey = "hemy360-viewer-theme-v1";

export function initViewerTheme() {
  const params = new URLSearchParams(location.search);
  let stored: string | null = null;
  try { stored = localStorage.getItem(storageKey); } catch { /* Private browsing may block storage. */ }
  const query = params.get("theme");
  const initial: ViewerTheme = query === "classic" || query === "hemy" ? query
    : stored === "hemy" ? "hemy" : "classic";
  const selectors = [...document.querySelectorAll<HTMLSelectElement>("#viewer-theme, #hemy-theme-select")];

  function apply(theme: ViewerTheme, save: boolean) {
    document.documentElement.dataset.viewerTheme = theme;
    for (const selector of selectors) selector.value = theme;
    if (save) {
      try { localStorage.setItem(storageKey, theme); } catch { /* The URL still carries the selection. */ }
      const next = new URL(location.href);
      next.searchParams.set("theme", theme);
      history.replaceState(history.state, "", next);
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  for (const selector of selectors) selector.addEventListener("change", () =>
    apply(selector.value === "hemy" ? "hemy" : "classic", true));
  apply(initial, false);

  const propertySelect = document.querySelector<HTMLSelectElement>("#property-select")!;
  const propertyList = document.querySelector<HTMLElement>("#hemy-property-list")!;
  const propertyCode = document.querySelector<HTMLElement>("#hemy-workspace-property-code")!;
  const propertyTitle = document.querySelector<HTMLElement>("#hemy-workspace-title")!;
  const topProperty = document.querySelector<HTMLElement>("#hemy-top-property")!;
  for (const option of propertySelect.options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.value.toUpperCase();
    button.title = option.textContent ?? option.value;
    button.setAttribute("aria-label", option.textContent ?? option.value);
    button.addEventListener("click", () => {
      propertySelect.value = option.value;
      propertySelect.dispatchEvent(new Event("change"));
    });
    propertyList.append(button);
  }
  function updateProperty() {
    const code = propertySelect.value.toUpperCase();
    propertyCode.textContent = code;
    topProperty.textContent = code;
    propertyTitle.textContent = `${code} · Viewer Lab`;
    for (const button of propertyList.querySelectorAll("button"))
      button.toggleAttribute("aria-current", button.textContent === code);
  }
  propertySelect.addEventListener("change", updateProperty);
  updateProperty();

  for (const button of document.querySelectorAll<HTMLButtonElement>(".hemy-rail button")) {
    button.addEventListener("click", () => {
      if (button.dataset.panelTarget === "#project-panel")
        document.querySelector<HTMLButtonElement>("#property-tab-projects")?.click();
      else document.querySelector<HTMLButtonElement>("#property-tab-aim")?.click();
      const target = document.querySelector<HTMLElement>(button.dataset.panelTarget!);
      if (target?.hidden) return;
      const group = target?.closest<HTMLDetailsElement>(".sidebar-group");
      if (group) group.open = true;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}
