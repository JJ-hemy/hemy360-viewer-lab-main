import * as BUI from "@thatopen/ui";
import * as CUI from "@thatopen/ui-obc";
import * as OBC from "@thatopen/components";
import { appIcons } from "../../globals";

export interface ModelsPanelState {
  components: OBC.Components;
}

export const modelsPanelTemplate: BUI.StatefullComponent<ModelsPanelState> = (
  state,
) => {
  const { components } = state;

  const ifcLoader = components.get(OBC.IfcLoader);
  const fragments = components.get(OBC.FragmentsManager);

  const [modelsList] = CUI.tables.modelsList({
    components,
    actions: { download: false },
  });

  const setStatus = (message: string, error = false) => {
    const status = document.getElementById("model-load-status");
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? "#ff9b91" : "#b7d9c8";
  };

  const onAddIfcModel = async ({ target }: { target: BUI.Button }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = ".ifc";
    input.style.display = "none";
    document.body.append(input);

    input.addEventListener("change", async () => {
      input.remove();
      const file = input.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".ifc")) {
        setStatus(`Dette er ikke en IFC-fil: ${file.name}. Velg Fragments for .frag-filer.`, true);
        BUI.ContextMenu.removeMenus();
        return;
      }
      if (file.size > 200 * 1024 * 1024) {
        setStatus(`${file.name} er for stor for IFC-konvertering i nettleseren. Velg den konverterte .frag-filen.`, true);
        BUI.ContextMenu.removeMenus();
        return;
      }
      if (fragments.list.has(file.name)) {
        setStatus(`${file.name} er allerede lastet inn.`, true);
        BUI.ContextMenu.removeMenus();
        return;
      }
      target.loading = true;
      setStatus(`Åpner IFC: ${file.name} …`);
      try {
        const buffer = await file.arrayBuffer();
        await ifcLoader.load(new Uint8Array(buffer), true, file.name);
        setStatus(`IFC åpnet: ${file.name}`);
      } catch (error) {
        setStatus(`Kunne ikke åpne IFC: ${error instanceof Error ? error.message : String(error)}`, true);
      } finally {
        target.loading = false;
        BUI.ContextMenu.removeMenus();
      }
    });

    input.addEventListener("cancel", () => {
      input.remove();
      target.loading = false;
    });

    input.click();
  };

  const onAddFragmentsModel = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    try {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".frag")) {
        setStatus(`Dette er ikke en Fragments-fil: ${file.name}. Velg IFC for .ifc-filer.`, true);
        BUI.ContextMenu.removeMenus();
        return;
      }
      const legacyId = file.name.replace(/\.frag$/i, "");
      if (fragments.list.has(file.name) || fragments.list.has(legacyId)) {
        setStatus(`Modellen ${file.name} er allerede lastet inn. Bruk modellen i listen, eller fjern den før du åpner filen på nytt.`, true);
        BUI.ContextMenu.removeMenus();
        return;
      }
      setStatus(`Åpner Fragments: ${file.name} …`);
      try {
        const buffer = await file.arrayBuffer();
        await fragments.core.load(new Uint8Array(buffer), {
          modelId: file.name,
        });
        setStatus(`Fragments åpnet: ${file.name}`);
      } catch (error) {
        setStatus(`Kunne ikke åpne Fragments: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    } finally {
      input.value = "";
    }
  };

  const onLoadHg62Zones = async ({ target }: { target: BUI.Button }) => {
    const modelId = "HG62-3DZones.frag";
    if (fragments.list.has(modelId)) {
      setStatus("HG62-sonene er allerede lastet inn.");
      return;
    }
    target.loading = true;
    setStatus("Åpner HG62-soner …");
    try {
      const response = await fetch("/models/HG62-3DZones.frag");
      if (!response.ok) throw new Error(`Modellfilen svarte med ${response.status}`);
      const buffer = await response.arrayBuffer();
      await fragments.core.load(new Uint8Array(buffer), { modelId });
      setStatus("HG62-soner åpnet (791 soner).");
    } catch (error) {
      setStatus(`Kunne ikke åpne HG62-soner: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      target.loading = false;
    }
  };

  const onSearch = (e: Event) => {
    const input = e.target as BUI.TextInput;
    modelsList.queryString = input.value;
  };

  return BUI.html`
    <bim-panel-section fixed icon=${appIcons.MODEL} label="Models">
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <bim-text-input @input=${onSearch} vertical placeholder="Search..." debounce="200"></bim-text-input>
        <bim-button style="flex: 0;" label="IFC (.ifc)" @click=${onAddIfcModel}></bim-button>
        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem;">Fragments (.frag)
          <input type="file" accept=".frag" aria-label="Velg Fragments-fil" @change=${onAddFragmentsModel} style="max-width: 15rem;" />
        </label>
        <bim-button style="flex: 0;" label="Åpne HG62-soner" @click=${onLoadHg62Zones}></bim-button>
      </div>
      <div id="model-load-status" role="status" aria-live="polite" style="font-size: 0.8rem; line-height: 1.3; padding: 0.25rem 0; white-space: normal;"></div>
      ${modelsList}
    </bim-panel-section>
  `;
};
