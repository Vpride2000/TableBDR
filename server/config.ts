// Конфигурация для сущностей GN: имя таблицы, PK-столбец и редактируемые поля.
// Общие типы и конфигурация для серверной части.
export interface GnTableConfig {
  tableName: string;
  idColumn: string;
  editableColumns: string[];
  numericColumns?: string[];
  arrayColumns?: string[];
  nullableColumns?: string[];
  nullableForeignKeyColumns?: string[];
  supportsExcelImportDeletion?: boolean;
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
    editableColumns: ['GN_dogovor', 'GN_contarctor_FK', 'GN_dogovor_date', 'GN_dogovor_signer_FK', 'GN_dogovor_personal_account', 'GN_dogovor_note'],
    nullableColumns: ['GN_dogovor_date'],
    nullableForeignKeyColumns: ['GN_dogovor_signer_FK'],
  },
  objects: {
    tableName: 'GN_departament_object',
    idColumn: 'GN_do_id',
    editableColumns: ['GN_departament_object', 'GN_department_FK', 'GN_department_FKs'],
    arrayColumns: ['GN_department_FKs'],
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
      'GN_contract_date',
      'GN_contract_term_from',
      'GN_contract_term_to',
    ],
  },
  'invest-okdp-tko-is-prit': {
    tableName: 'GN_invest_okdp_tko_is_prit',
    idColumn: 'GN_invest_okdp_tko_is_prit_id',
    editableColumns: ['GN_invest_okdp_tko_is_prit'],
    supportsExcelImportDeletion: true,
  },
  'invest-ogruz-rekvizit': {
    tableName: 'GN_invest_ogruz_rekvizit',
    idColumn: 'GN_invest_ogruz_rekvizit_id',
    editableColumns: ['GN_invest_ogruz_rekvizit', 'GN_department_FK', 'GN_departament_object_FK', 'Почтовый адрес'],
    supportsExcelImportDeletion: true,
  },
  'equipment-manufacturers': {
    tableName: 'GN_equipment_manufacturer',
    idColumn: 'GN_equipment_manufacturer_id',
    editableColumns: ['GN_equipment_manufacturer', 'Полное название', 'СТРАНА', 'Доп. информация'],
    supportsExcelImportDeletion: true,
  },
  'equipment-types': {
    tableName: 'GN_equipment_type',
    idColumn: 'GN_equipment_type_id',
    editableColumns: ['GN_equipment_type'],
  },
  'equipment-models': {
    tableName: 'GN_equipment_model',
    idColumn: 'GN_equipment_model_id',
    editableColumns: [
      'GN_equipment_model',
      'GN_equipment_manufacturer_FK',
      'GN_equipment_type_FK',
      'GN_equipment_department_FK',
      'GN_equipment_budget_item_FK',
      'GN_equipment_object_FK',
    ],
  },
  'satellite-gt-numbers': {
    tableName: 'GN_satellite_gt_numbers',
    idColumn: 'GN_satellite_gt_numbers_id',
    editableColumns: ['GN_satellite_gt_number'],
  },
  'cellular-identifiers': {
    tableName: 'GN_cellular_identifier',
    idColumn: 'GN_cellular_identifier_id',
    editableColumns: ['GN_cellular_identifier', 'GN_cellular_identifier_fio'],
    supportsExcelImportDeletion: true,
  },
  'cellular-tariff-plans': {
    tableName: 'GN_cellular_tariff_plan',
    idColumn: 'GN_cellular_tariff_plan_id',
    editableColumns: ['GN_cellular_tariff_plan', 'GN_cellular_tariff_plan_details', 'GN_cellular_tariff_plan_cost'],
    numericColumns: ['GN_cellular_tariff_plan_cost'],
  },
  'cellular-accounts': {
    tableName: 'GN_cellular_account',
    idColumn: 'GN_cellular_account_id',
    editableColumns: ['GN_cellular_account', 'GN_department_FK', 'GN_cellular_account_note'],
  },
  'gazprom-telecom': {
    tableName: 'GN_gazprom_telecom',
    idColumn: 'GN_gazprom_telecom_id',
    editableColumns: [
      'tariff',
      'provided_services',
      'service_identifier',
      'description',
      'tariff_groups',
      'unit',
      'GN_dogovor_FK',
      'quantity',
      'monthly_tariff',
      'PAO_budget_network_item_FK',
      'GN_department_FK',
      'GN_departament_object_FK',
      'note',
    ],
    numericColumns: ['monthly_tariff'],
    nullableForeignKeyColumns: ['GN_dogovor_FK', 'GN_department_FK', 'GN_departament_object_FK'],
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
  'import-substitution': {
    tableName: 'GN_import_substitution',
    idColumn: 'GN_import_substitution_id',
    editableColumns: ['Подразделение', 'Процент исполнения'],
  },
};

export const BDR_SELECT_FIELDS = `SELECT
  b."GN_bdr_ID",
  pao."PAO__budget_network_item"    AS "Статья бюджета УС",
  dep."GN_department"               AS "Подразделение",
  obj."GN_departament_object"       AS "Объект",
  dgv."GN_dogovor"                  AS "Договор",
  b."GN_bdr_calculation"            AS "РАСЧЕТ",
  cnt."GN_contarctor"               AS "Контрагент",
  bni."GN_budget_network_item"      AS "Статья бюджета",
  b."GN_bdr_predmet_dogovora"       AS "Предмет договора",
  b."GN_bdr_ed.izm"                 AS "Ед. изм.",
  b."GN_bdr_kol-vo"                 AS "Кол-во",
  b."GN_bdr_limit"                  AS "Лимит",
  b."GN_bdr_bdr25_corr"             AS "БДР25корр",
  b."GN_bdr_bdr25_corr_kol_vo"      AS "Кол-во БДР25корр",
  b."GN_bdr_bdr26"                  AS "БДР26",
  b."GN_bdr_bdr26_kol_vo"           AS "Кол-во БДР26",
  b."GN_bdr_bdr26_corr"             AS "БДР26корр",
  b."GN_bdr_bdr26_corr_kol_vo"      AS "Кол-во БДР26корр",
  b."GN_bdr_bdr27_kol_vo"           AS "Кол-во БДР27",
  b."GN_bdr_bdr27"                  AS "БДР27",
  b."GN_bdr_edin.limit"             AS "Един. лимит",
  b."GN_bdr_comments"               AS "Примечания"
FROM "GN_bdr" b
JOIN "PAO__budget_network_item" pao ON b."PAO_budget_network_item_FK" = pao."PAO_b_id"
JOIN "GN_department"            dep ON b."GN_department_FK"           = dep."GN_Dep_id"
JOIN "GN_departament_object"    obj ON b."GN_departament_object_FK"   = obj."GN_do_id"
JOIN "GN_dogovor"               dgv ON b."GN_dogovor_FK"              = dgv."GN_dgv_id"
JOIN "GN_contractor"            cnt ON b."GN_contracor_FK"            = cnt."GN_c_id"
JOIN "GN_budget_network_item"   bni ON b."GN_budget_network_item_FK"  = bni."GN_b_id"`;
