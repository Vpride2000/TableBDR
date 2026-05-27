// Конфигурация для сущностей GN: имя таблицы, PK-столбец и редактируемые поля.
// Общие типы и конфигурация для серверной части.
export interface GnTableConfig {
  tableName: string;
  idColumn: string;
  editableColumns: string[];
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
      'GN_contract_approval_status',
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
  'contract-additional-agreements': {
    tableName: 'GN_contract_additional_agreements',
    idColumn: 'GN_additional_agreement_id',
    editableColumns: [
      'GN_contract_id_FK',
      'GN_additional_agreement_number',
      'GN_additional_agreement_date',
      'GN_additional_agreement_description',
      'GN_additional_agreement_amount',
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
