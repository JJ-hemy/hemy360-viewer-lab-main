/** Additional BS17 LCC2 exports. The source files remain outside Git. */
export const bs17Catalog = [
  { id: "roof-184147", label: "Tak · 184147", folderPrefix: "BS17_ZZ_ROOF_", aligned: true },
  { id: "storage-133309", label: "Lager · 133309", folderPrefix: "BS17_01_STORAGE_", aligned: true },
  { id: "fagmoebler2-120101", label: "Fagmøbler2 · 120101", folderPrefix: "BS17_02_FAGMOEBLER2_", aligned: true },
  { id: "fagmoebler4-133309", label: "Fagmøbler4 · 133309", folderPrefix: "BS17_02_FAGMOEBLER4_", aligned: true },
  { id: "hvac-140642", label: "Fagmøbler HVAC · 140642", folderPrefix: "BS17_03_FAGMOEBLER-HVAC_", aligned: true },
  { id: "fagmoebler1-112646", label: "Fagmøbler1 3DGS · 112646", folderPrefix: "BS17_02_FAGMOEBLER1_", aligned: true },
  { id: "boiler-180322", label: "Boiler room 3DGS · 180322", folderPrefix: "BS17_03_BOILER-ROOM_", aligned: true },
  { id: "drommekjokken-121252", label: "Drømmekjøkken · 121252", folderPrefix: "BS17_01_DROMEKITCHEN_", aligned: false },
  { id: "polarbad-132922", label: "Polarbad · 132922", folderPrefix: "BS17_01_POLARBAD_", aligned: false },
  { id: "motek-183256", label: "Motek · 183256", folderPrefix: "BS17_01_MOTEK_", aligned: false },
] as const;

export type Bs17CatalogId = (typeof bs17Catalog)[number]["id"];
