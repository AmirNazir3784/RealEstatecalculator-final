export interface MenuTool {
  slug: string;
  name: string;
  icon: string;
}

export interface MenuGroup {
  id: string;
  title: string;
  tools: MenuTool[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'tools-group-0',
    title: 'Buying & Financing',
    tools: [
      { slug: 'mortgage-calculator', name: 'Mortgage Calculator', icon: '$' },
      { slug: 'down-payment-calculator', name: 'Down Payment Calculator', icon: '↓' },
      { slug: 'home-affordability-calculator', name: 'Home Affordability Calculator', icon: '⌂' },
      { slug: 'rent-vs-buy-calculator', name: 'Rent vs Buy Calculator', icon: '⇄' },
      { slug: 'bridge-loan-calculator', name: 'Bridge Loan Calculator', icon: '⇋' },
    ],
  },
  {
    id: 'tools-group-1',
    title: 'Property Investment',
    tools: [
      { slug: 'cap-rate-calculator', name: 'Cap Rate Calculator', icon: '÷' },
      { slug: 'rental-yield-calculator', name: 'Rental Yield Calculator', icon: '◉' },
      { slug: 'commercial-real-estate-calculator', name: 'Commercial Real Estate Calculator', icon: '▦' },
      { slug: 'irr-calculator', name: 'IRR Calculator', icon: '↗' },
      { slug: 'wholesale-calculator', name: 'Wholesale Calculator', icon: '⇌' },
      { slug: 'noi-calculator', name: 'NOI Calculator', icon: '∑' },
      { slug: 'roi-calculator', name: 'ROI Calculator', icon: '▲' },
      { slug: 'property-investment-calculator', name: 'Property Investment Calculator', icon: '◈' },
    ],
  },
  {
    id: 'tools-group-2',
    title: 'Selling, Tax & Agent Tools',
    tools: [
      { slug: 'commission-calculator', name: 'Commission Calculator', icon: '%' },
      { slug: 'capital-gains-tax-calculator', name: 'Capital Gains Tax Calculator', icon: '§' },
      { slug: 'depreciation-calculator', name: 'Depreciation Calculator', icon: '↘' },
    ],
  },
];

export const FOOTER_COL_1: MenuTool[] = [
  { slug: 'mortgage-calculator', name: 'Mortgage Calculator', icon: '$' },
  { slug: 'down-payment-calculator', name: 'Down Payment Calculator', icon: '↓' },
  { slug: 'home-affordability-calculator', name: 'Home Affordability Calculator', icon: '⌂' },
  { slug: 'rent-vs-buy-calculator', name: 'Rent vs Buy Calculator', icon: '⇄' },
  { slug: 'bridge-loan-calculator', name: 'Bridge Loan Calculator', icon: '⇋' },
  { slug: 'cap-rate-calculator', name: 'Cap Rate Calculator', icon: '÷' },
  { slug: 'rental-yield-calculator', name: 'Rental Yield Calculator', icon: '◉' },
];

export const FOOTER_COL_2: MenuTool[] = [
  { slug: 'commercial-real-estate-calculator', name: 'Commercial Real Estate Calculator', icon: '▦' },
  { slug: 'irr-calculator', name: 'IRR Calculator', icon: '↗' },
  { slug: 'depreciation-calculator', name: 'Depreciation Calculator', icon: '↘' },
  { slug: 'wholesale-calculator', name: 'Wholesale Calculator', icon: '⇌' },
  { slug: 'noi-calculator', name: 'NOI Calculator', icon: '∑' },
  { slug: 'roi-calculator', name: 'ROI Calculator', icon: '▲' },
  { slug: 'property-investment-calculator', name: 'Property Investment Calculator', icon: '◈' },
  { slug: 'commission-calculator', name: 'Commission Calculator', icon: '%' },
  { slug: 'capital-gains-tax-calculator', name: 'Capital Gains Tax Calculator', icon: '§' },
];
