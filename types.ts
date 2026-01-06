
export interface CalculationResult {
  id: string;
  timestamp: number;
  grossWeight: number;
  netWeight: number;
  price: number;
  label: string;
}

export interface PerfumeInquiry {
  role: 'user' | 'assistant';
  content: string;
}

export enum Constants {
  BOTTLE_GROSS_WEIGHT = 136,
  PRICE_PER_UNIT = 230, // Updated to 230 TSh as per user correction
  CURRENCY = 'TSh'
}
