export interface GnTableConfig {
  tableName: string;
  idColumn: string;
  editableColumns: string[];
}

export interface ReferenceTableDefinition {
  entity: string;
  tableName: string;
  idColumn: string;
  valueColumn: string;
  title: string;
  seedValues: string[];
}

export interface ContractRowSeed {
  contractorId: number;
  dogovorId: number;
  sedLaunchDate: string;
  asezLoadDate: string;
  state: string;
  statusUpdatedAt: string;
}

export interface LimitCalculationLineInput {
  quantity: number;
  tariff: number;
  note: string;
}

export interface LimitCalculationLineRow {
  line_order: number;
  quantity: string | number;
  tariff: string | number;
  line_note: string;
}

export interface LimitCalculationResponseLine {
  lineOrder: number;
  quantity: number;
  tariff: number;
  note: string;
}

export interface ForecastMonthlyApiRowInput {
  rowId?: unknown;
  monthlyValues?: unknown;
  monthlyFactValues?: unknown;
}

export interface ForecastMonthlyDbRow {
  row_id: number | string;
  month_index: number | string;
  month_value: number | string;
  month_fact_value: number | string;
}

export const INVEST_REFERENCE_TABLES: ReferenceTableDefinition[] = [
  {
    entity: 'invest-okdp-tko-is-prit',
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    valueColumn: 'GN_invest_okdp_tko_is_prit',
    title: 'ОКДП ТКО для ИС ПРИТ',
    seedValues: [
      '3531100000000',
      '3531200000000',
      '3531300000000',
      '3531400000000',
      '3531500000000',
    ],
  },
  {
    entity: 'invest-ogruz-rekvizit',
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    valueColumn: 'GN_invest_ogruz_rekvizit',
    title: 'Огрузочный реквизит',
    seedValues: [
      'Реквизит А',
      'Реквизит Б',
      'Реквизит В',
      'Реквизит Г',
      'Реквизит Д',
    ],
  },
];

export const CONTRACT_ROW_SEEDS: ContractRowSeed[] = [
  {
    contractorId: 1,
    dogovorId: 1,
    sedLaunchDate: '2026-01-10',
    asezLoadDate: '2026-01-12',
    state: 'Запущен',
    statusUpdatedAt: '2026-01-13',
  },
  {
    contractorId: 2,
    dogovorId: 2,
    sedLaunchDate: '2026-01-15',
    asezLoadDate: '2026-01-16',
    state: 'В работе',
    statusUpdatedAt: '2026-01-17',
  },
  {
    contractorId: 3,
    dogovorId: 3,
    sedLaunchDate: '2026-01-20',
    asezLoadDate: '2026-01-22',
    state: 'Проверка',
    statusUpdatedAt: '2026-01-23',
  },
  {
    contractorId: 4,
    dogovorId: 4,
    sedLaunchDate: '2026-01-25',
    asezLoadDate: '2026-01-27',
    state: 'Согласование',
    statusUpdatedAt: '2026-01-28',
  },
  {
    contractorId: 5,
    dogovorId: 5,
    sedLaunchDate: '2026-02-01',
    asezLoadDate: '2026-02-03',
    state: 'Завершен',
    statusUpdatedAt: '2026-02-04',
  },
];

export const GN_TABLE_CONFIGS: Record<string, GnTableConfig> = {
  departments: {
    tableName: 'GN_department',
    idColumn: 'GN_Dep_id',
    editableColumns: ['GN_department'],
  },
  'budget-items': {
    tableName: 'GN_budget_network_item',
    idColumn: 'GN_b_id',
    editableColumns: ['GN_budget_network_item'],
  },
  'pao-budget-items': {
    tableName: 'PAO__budget_network_item',
    idColumn: 'PAO_b_id',
    editableColumns: ['PAO__budget_network_item'],
  },
  contractors: {
    tableName: 'GN_contractor',
    idColumn: 'GN_c_id',
    editableColumns: ['GN_contarctor'],
  },
  dogovors: {
    tableName: 'GN_dogovor',
    idColumn: 'GN_dgv_id',
    editableColumns: ['GN_dogovor', 'GN_contarctor_FK'],
  },
  objects: {
    tableName: 'GN_departament_object',
    idColumn: 'GN_do_id',
    editableColumns: ['GN_departament_object', 'GN_department_FK'],
  },
  contracts: {
    tableName: 'GN_contracts',
    idColumn: 'GN_contract_id',
    editableColumns: [
      'GN_contract_contractor_FK',
      'GN_contract_dogovor_FK',
      'GN_contract_sed_launch_date',
      'GN_contract_asez_load_date',
      'GN_contract_state',
      'GN_contract_status_updated_at',
    ],
  },
  'invest-okdp-tko-is-prit': {
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    editableColumns: ['GN_invest_okdp_tko_is_prit'],
  },
  'invest-ogruz-rekvizit': {
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    editableColumns: ['GN_invest_ogruz_rekvizit'],
  },
};

export const BDR_SELECT_FIELDS = `SELECT
  b."GN_bdr_ID",
  pao."PAO__budget_network_item"    AS "Статья бюджета УС",
  dep."GN_department"               AS "Подразделение",
  obj."GN_departament_object"       AS "Объект",
  dgv."GN_dogovor"                  AS "Договор",
  cnt."GN_contarctor"               AS "Контрагент",
  bni."GN_budget_network_item"      AS "Статья бюджета",
  b."GN_bdr_predmet_dogovora"       AS "Предмет договора",
  b."GN_bdr_ed.izm"                 AS "Ед. изм.",
  b."GN_bdr_kol-vo"                 AS "Кол-во",
  b."GN_bdr_limit"                  AS "Лимит",
  b."GN_bdr_edin.limit"             AS "Един. лимит",
  b."GN_bdr_comments"               AS "Примечания"
FROM "GN_bdr" b
JOIN "PAO__budget_network_item" pao ON b."PAO_budget_network_item_FK" = pao."PAO_b_id"
JOIN "GN_department"            dep ON b."GN_department_FK"           = dep."GN_Dep_id"
JOIN "GN_departament_object"    obj ON b."GN_departament_object_FK"   = obj."GN_do_id"
JOIN "GN_dogovor"               dgv ON b."GN_dogovor_FK"              = dgv."GN_dgv_id"
JOIN "GN_contractor"            cnt ON b."GN_contracor_FK"            = cnt."GN_c_id"
JOIN "GN_budget_network_item"   bni ON b."GN_budget_network_item_FK"  = bni."GN_b_id"`;