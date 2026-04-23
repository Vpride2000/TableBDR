// Конфигурация для сущностей GN: имя таблицы, PK-столбец и редактируемые поля.
// Общие типы и конфигурация для серверной части.
// Этот файл описывает структуру GN-сущностей, справочных таблиц, API-персистентных строк
// и значения, которые автоматически создаются при инициализации сервера.
export interface GnTableConfig {
  tableName: string;
  idColumn: string;
  editableColumns: string[];
}

// Описание справочных таблиц, которые заполняются начальными значениями.
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

export interface InvestProgramRowSeed {
  pfNpf: string;
  name: string;
  quantity: number;
  okdpFk: number;
  supplierFk: number;
  ogruzFk: number;
  status: string;
  payment: string;
  inBudget: string;
  peoCode: string;
  mtrCode: string;
  pzp: string;
  agentReport: string;
  ap: string;
  spec: string;
  commissioning: string;
  itAccounting: string;
  sedSpec: string;
  sedAgentReport: string;
  state: string;
  realPriceNoVatPerUnit: number;
  realSumNoVatPlusAgentNoVat: number;
  sumNoVat: number;
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

// Типы входящих данных для PUT /api/gn/forecast-monthly.
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

// Конфигурация справочных таблиц, которые создаются и заполняются при старте сервера.
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

export const INVEST_PROGRAM_SEEDS: InvestProgramRowSeed[] = [
  {
    pfNpf: 'ПФ',
    name: 'Маршрутизатор Cisco ISR 4331',
    quantity: 1,
    okdpFk: 1,
    supplierFk: 1,
    ogruzFk: 1,
    status: 'Активен',
    payment: 'Оплачен',
    inBudget: 'Да',
    peoCode: 'ПЭО-001',
    mtrCode: 'MTR-1000',
    pzp: 'ПЗП-1',
    agentReport: 'Агент-1',
    ap: 'АП-1',
    spec: 'СП-100',
    commissioning: 'Q1 2027',
    itAccounting: 'Да',
    sedSpec: 'СЭД-1',
    sedAgentReport: 'СЭД Агент-1',
    state: 'Запущен',
    realPriceNoVatPerUnit: 10000,
    realSumNoVatPlusAgentNoVat: 11000,
    sumNoVat: 12000,
  },
  {
    pfNpf: 'НПФ',
    name: 'Коммутатор Huawei S5735-L24T4X',
    quantity: 2,
    okdpFk: 2,
    supplierFk: 2,
    ogruzFk: 2,
    status: 'В работе',
    payment: 'Частично',
    inBudget: 'Да',
    peoCode: 'ПЭО-002',
    mtrCode: 'MTR-1001',
    pzp: 'ПЗП-2',
    agentReport: 'Агент-2',
    ap: 'АП-2',
    spec: 'СП-101',
    commissioning: 'Q2 2027',
    itAccounting: 'Нет',
    sedSpec: 'СЭД-2',
    sedAgentReport: 'СЭД Агент-2',
    state: 'В работе',
    realPriceNoVatPerUnit: 15000,
    realSumNoVatPlusAgentNoVat: 16500,
    sumNoVat: 18000,
  },
  {
    pfNpf: 'ПФ',
    name: 'Точка доступа Ubiquiti UniFi U6-Pro',
    quantity: 3,
    okdpFk: 3,
    supplierFk: 3,
    ogruzFk: 3,
    status: 'Завершен',
    payment: 'Оплачен',
    inBudget: 'Да',
    peoCode: 'ПЭО-003',
    mtrCode: 'MTR-1002',
    pzp: 'ПЗП-3',
    agentReport: 'Агент-3',
    ap: 'АП-3',
    spec: 'СП-102',
    commissioning: 'Q3 2027',
    itAccounting: 'Да',
    sedSpec: 'СЭД-3',
    sedAgentReport: 'СЭД Агент-3',
    state: 'Завершен',
    realPriceNoVatPerUnit: 8000,
    realSumNoVatPlusAgentNoVat: 8800,
    sumNoVat: 9600,
  },
  {
    pfNpf: 'НПФ',
    name: 'IP-телефон Yealink SIP-T54W',
    quantity: 1,
    okdpFk: 4,
    supplierFk: 4,
    ogruzFk: 4,
    status: 'Активен',
    payment: 'Не оплачен',
    inBudget: 'Нет',
    peoCode: 'ПЭО-004',
    mtrCode: 'MTR-1003',
    pzp: 'ПЗП-4',
    agentReport: 'Агент-4',
    ap: 'АП-4',
    spec: 'СП-103',
    commissioning: 'Q4 2027',
    itAccounting: 'Нет',
    sedSpec: 'СЭД-4',
    sedAgentReport: 'СЭД Агент-4',
    state: 'Проверка',
    realPriceNoVatPerUnit: 5000,
    realSumNoVatPlusAgentNoVat: 5500,
    sumNoVat: 6000,
  },
  {
    pfNpf: 'ПФ',
    name: 'Радиомодем Eltex WOP-2ac-LR5',
    quantity: 2,
    okdpFk: 5,
    supplierFk: 5,
    ogruzFk: 5,
    status: 'В работе',
    payment: 'Частично',
    inBudget: 'Да',
    peoCode: 'ПЭО-005',
    mtrCode: 'MTR-1004',
    pzp: 'ПЗП-5',
    agentReport: 'Агент-5',
    ap: 'АП-5',
    spec: 'СП-104',
    commissioning: 'Q1 2028',
    itAccounting: 'Да',
    sedSpec: 'СЭД-5',
    sedAgentReport: 'СЭД Агент-5',
    state: 'Согласование',
    realPriceNoVatPerUnit: 12000,
    realSumNoVatPlusAgentNoVat: 13200,
    sumNoVat: 14400,
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
  'invest-program': {
    tableName: 'GN_invest_program',
    idColumn: 'GN_invest_program_id',
    editableColumns: [
      'GN_invest_pf_npf',
      'GN_invest_name',
      'GN_invest_quantity',
      'GN_invest_okdp_fk',
      'GN_invest_supplier_fk',
      'GN_invest_ogruz_fk',
      'GN_invest_status',
      'GN_invest_payment',
      'GN_invest_in_budget',
      'GN_invest_peo_code',
      'GN_invest_mtr_code',
      'GN_invest_pzp',
      'GN_invest_agent_report',
      'GN_invest_ap',
      'GN_invest_spec',
      'GN_invest_commissioning',
      'GN_invest_it_accounting',
      'GN_invest_sed_spec',
      'GN_invest_sed_agent_report',
      'GN_invest_state',
      'GN_invest_real_price_no_vat_per_unit',
      'GN_invest_real_sum_no_vat_plus_agent_no_vat',
      'GN_invest_sum_no_vat',
    ],
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