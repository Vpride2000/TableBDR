declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

export interface ContractAdditionalAgreement {
  GN_additional_agreement_id: number;
  GN_contract_id_FK: number;
  GN_additional_agreement_number: string;
  GN_additional_agreement_date: string;
  GN_additional_agreement_description: string;
  GN_additional_agreement_amount: number;
  contract_number?: string;
}