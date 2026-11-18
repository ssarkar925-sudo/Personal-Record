import { DatabaseSync } from 'node:sqlite';
import { createAccount } from './accounts-repo.ts';
import { createTransaction, createLoan, createPersonDue, createRecurringBill } from './ledger-repo.ts';
import { upsertNote } from './notes-repo.ts';
import { addMonthsISO, todayISO } from '../../shared/ledger-core.ts';

export interface SeedSummary {
  accountsCount: number;
  txCount: number;
  loansCount: number;
  duesCount: number;
  notesCount: number;
  billsCount: number;
}

export function seedFinancialData(db: DatabaseSync): SeedSummary {
  // 1. Bank Accounts & Cards
  const salaryBank = createAccount(db, {
    name: 'HDFC Corporate & Salary',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'business',
    institution: 'HDFC Bank',
    last4: '4192',
    openingBalanceMinor: 84500000, // ₹8,45,000.00
    minBalanceMinor: 10000000,
  });

  const iciciWealth = createAccount(db, {
    name: 'ICICI Wealth Treasury',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'business',
    institution: 'ICICI Bank',
    last4: '9321',
    openingBalanceMinor: 142000000, // ₹14,20,000.00
    minBalanceMinor: 25000000,
  });

  createAccount(db, {
    name: 'SBI Family Reserve',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'family',
    institution: 'State Bank of India',
    last4: '7810',
    openingBalanceMinor: 68000000, // ₹6,80,000.00
    minBalanceMinor: 5000000,
  });

  createAccount(db, {
    name: 'Kotak Personal 811',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'personal',
    institution: 'Kotak Mahindra Bank',
    last4: '3319',
    openingBalanceMinor: 18500000, // ₹1,85,000.00
  });

  const axisBusiness = createAccount(db, {
    name: 'Axis Current Account',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'business',
    institution: 'Axis Bank',
    last4: '5521',
    openingBalanceMinor: 125000000, // ₹12,50,000.00
    minBalanceMinor: 20000000,
  });

  // Credit Cards
  const creditCard = createAccount(db, {
    name: 'ICICI Amazon Pay Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'ICICI Bank',
    last4: '8831',
    openingBalanceMinor: 0,
    creditLimitMinor: 25000000, // ₹2,50,000 limit
    statementDay: 15,
    dueDay: 5,
  });

  const hdfcRegalia = createAccount(db, {
    name: 'HDFC Regalia Gold',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'HDFC Bank',
    last4: '2049',
    openingBalanceMinor: 1240000, // ₹12,400 billed statement balance
    creditLimitMinor: 45000000, // ₹4,50,000 limit
    statementDay: 18,
    dueDay: 8,
  });

  const sbiCashback = createAccount(db, {
    name: 'SBI Cashback Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'SBI Cards',
    last4: '6712',
    openingBalanceMinor: 0,
    creditLimitMinor: 18000000, // ₹1,80,000 limit
    statementDay: 12,
    dueDay: 2,
  });

  const axisFlipkart = createAccount(db, {
    name: 'Axis Flipkart Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'Axis Bank',
    last4: '4920',
    openingBalanceMinor: 0,
    creditLimitMinor: 20000000, // ₹2,00,000 limit
    statementDay: 20,
    dueDay: 10,
  });

  const amexTravel = createAccount(db, {
    name: 'Amex Platinum Travel',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'American Express',
    last4: '1004',
    openingBalanceMinor: 1850000, // ₹18,500 billed statement balance
    creditLimitMinor: 60000000, // ₹6,00,000 limit
    statementDay: 25,
    dueDay: 15,
  });

  const oneCardMetal = createAccount(db, {
    name: 'OneCard Metal',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'business',
    institution: 'Federal Bank',
    last4: '9982',
    openingBalanceMinor: 420000, // ₹4,200 billed statement balance
    creditLimitMinor: 15000000, // ₹1,50,000 limit
    statementDay: 10,
    dueDay: 28,
  });

  // Wallets & Cash
  const wallet = createAccount(db, {
    name: 'Cash & UPI Float',
    type: 'bank',
    accountGroup: 'cash',
    scope: 'business',
    institution: 'Petty Cash & UPI',
    last4: '0000',
    openingBalanceMinor: 1850000, // ₹18,500.00
  });

  const paytmWallet = createAccount(db, {
    name: 'Paytm Merchant Wallet',
    type: 'bank',
    accountGroup: 'wallet',
    scope: 'business',
    institution: 'Paytm Payments',
    last4: '1288',
    openingBalanceMinor: 620000, // ₹6,200.00
  });

  createAccount(db, {
    name: 'Amazon Pay Balance',
    type: 'bank',
    accountGroup: 'wallet',
    scope: 'personal',
    institution: 'Amazon',
    last4: '9002',
    openingBalanceMinor: 450000, // ₹4,500.00
  });

  // 2. Transactions across 6-month historical window + current month
  const today = todayISO();
  const offsetDaysISO = (baseISO: string, daysOffset: number): string => {
    const [y, m, d] = baseISO.split('-').map(Number);
    const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + daysOffset));
    return dt.toISOString().slice(0, 10);
  };

  const historicalMonths = [
    { offset: -5, incomeMinor: 14500000, expenseMinor: 8200000, bizExpenseMinor: 1900000 },
    { offset: -4, incomeMinor: 15200000, expenseMinor: 9100000, bizExpenseMinor: 2100000 },
    { offset: -3, incomeMinor: 14800000, expenseMinor: 7600000, bizExpenseMinor: 1650000 },
    { offset: -2, incomeMinor: 16500000, expenseMinor: 8800000, bizExpenseMinor: 2400000 },
    { offset: -1, incomeMinor: 17200000, expenseMinor: 8400000, bizExpenseMinor: 1950000 },
  ];

  let seededTxCount = 0;

  for (const h of historicalMonths) {
    const dateISO = addMonthsISO(today, h.offset);
    createTransaction(db, {
      kind: 'income',
      scope: 'business',
      accountId: axisBusiness.id,
      category: 'Client Retainer & Revenue',
      amountMinor: h.incomeMinor,
      occurredAt: dateISO,
      party: 'TechCorp & Enterprise Clients',
      note: 'Monthly Enterprise Retainer & Settlement',
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'business',
      accountId: salaryBank.id,
      category: 'Operations & Payroll',
      amountMinor: h.expenseMinor,
      occurredAt: dateISO,
      party: 'Core Operations & Vendor Payouts',
      note: 'Monthly operating disbursements',
    });
    createTransaction(db, {
      kind: 'expense',
      scope: 'business',
      accountId: iciciWealth.id,
      category: 'Cloud & Operations',
      amountMinor: h.bizExpenseMinor,
      occurredAt: dateISO,
      party: 'AWS & SaaS Infrastructure',
      note: 'Monthly infrastructure billing',
    });
    seededTxCount += 3;
  }

  const txData = [
    { kind: 'income' as const, scope: 'business' as const, category: 'Client Retainer', amountMinor: 14500000, party: 'TechCorp India', note: 'Enterprise Retainer Settlement', accountId: salaryBank.id, daysOffset: -12 },
    { kind: 'income' as const, scope: 'business' as const, category: 'Advisory Retainer', amountMinor: 6800000, party: 'Apex Ventures', note: 'Architecture advisory milestone', accountId: axisBusiness.id, daysOffset: -6 },
    { kind: 'income' as const, scope: 'business' as const, category: 'Treasury Yield', amountMinor: 2450000, party: 'ICICI Corporate Sweep', note: 'Quarterly liquid reserve dividend', accountId: iciciWealth.id, daysOffset: -2 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Office & Equipment', amountMinor: 640000, party: 'Amazon Business Prime', note: 'Smart studio lighting & network gear', accountId: creditCard.id, daysOffset: -13 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'SaaS & Cloud', amountMinor: 980000, party: 'Vercel & OpenAI Enterprise', note: 'Production compute cluster', accountId: amexTravel.id, daysOffset: -11 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Client Hospitality', amountMinor: 428000, party: 'Indian Accent', note: 'Executive client dinner', accountId: hdfcRegalia.id, daysOffset: -9 },
    { kind: 'expense' as const, scope: 'personal' as const, category: 'Cashback Shopping', amountMinor: 515000, party: 'Myntra Luxe & Nykaa', note: 'Apparel & grooming essentials', accountId: sbiCashback.id, daysOffset: -7 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Flight Tickets', amountMinor: 2450000, party: 'Vistara Business', note: 'Bengaluru summit return flights', accountId: amexTravel.id, daysOffset: -5 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Workstation Hardware', amountMinor: 389000, party: 'Flipkart Commercial', note: 'Ergonomic studio accessories', accountId: axisFlipkart.id, daysOffset: -4 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Electronics', amountMinor: 1420000, party: 'Apple Authorised Enterprise', note: 'Studio display & Thunderbolt dock', accountId: hdfcRegalia.id, daysOffset: -2 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Coffee & Lounge', amountMinor: 215000, party: 'Blue Tokai Roasters', note: 'Client strategy briefing', accountId: oneCardMetal.id, daysOffset: -1 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Pantry & Supplies', amountMinor: 845000, party: 'Nature Basket Corporate', note: 'Studio hospitality & pantry supplies', accountId: creditCard.id, daysOffset: 0 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Software Subscriptions', amountMinor: 164900, party: 'Apple One & Figma Org', note: 'Design & cloud bundle', accountId: creditCard.id, daysOffset: 0 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Hotel & Lounge', amountMinor: 1180000, party: 'Taj West End', note: 'Executive suite & boardroom', accountId: amexTravel.id, daysOffset: 0 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Utilities & Fiber', amountMinor: 615000, party: 'Tata Power & Airtel Leased Line', note: 'Office power & dedicated fiber', accountId: salaryBank.id, daysOffset: -3 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Fleet & Fuel', amountMinor: 550000, party: 'Shell V-Power Corporate', note: 'Executive vehicle fuel', accountId: axisBusiness.id, daysOffset: -1 },
    { kind: 'expense' as const, scope: 'family' as const, category: 'Health & Wellness', amountMinor: 445000, party: 'Apollo Executive Health', note: 'Preventive diagnostics & supplements', accountId: wallet.id, daysOffset: -2 },
    { kind: 'expense' as const, scope: 'business' as const, category: 'Executive Commute', amountMinor: 138000, party: 'Uber Premier Business', note: 'Airport terminal transfers', accountId: paytmWallet.id, daysOffset: 0 },
  ];

  for (const tx of txData) {
    createTransaction(db, {
      kind: tx.kind,
      scope: tx.scope,
      accountId: tx.accountId,
      category: tx.category,
      amountMinor: tx.amountMinor,
      occurredAt: offsetDaysISO(today, tx.daysOffset),
      party: tx.party,
      note: tx.note,
    });
    seededTxCount += 1;
  }

  // 3. Loans
  createLoan(db, {
    name: 'HDFC Car Loan',
    counterparty: 'HDFC Bank Ltd',
    scope: 'personal',
    direction: 'borrowed',
    principalMinor: 40000000, // ₹4,00,000
    remainingMinor: 26000000, // ₹2,60,000
    annualRateBps: 875, // 8.75%
    tenureMonths: 48,
    emiMinor: 985000, // ₹9,850
    startDate: '2025-06-01',
    nextDueDate: '2026-12-01',
    linkedAccountId: salaryBank.id,
  });

  createLoan(db, {
    name: 'SBI Home Loan',
    counterparty: 'State Bank of India',
    scope: 'family',
    direction: 'borrowed',
    principalMinor: 350000000, // ₹35,00,000
    remainingMinor: 285000000, // ₹28,50,000
    annualRateBps: 840, // 8.40%
    tenureMonths: 240,
    emiMinor: 3240000, // ₹32,400
    startDate: '2023-01-10',
    nextDueDate: '2026-11-20',
    linkedAccountId: salaryBank.id,
  });

  createLoan(db, {
    name: 'ICICI Personal Loan',
    counterparty: 'ICICI Bank',
    scope: 'personal',
    direction: 'borrowed',
    principalMinor: 25000000, // ₹2,50,000
    remainingMinor: 8500000, // ₹85,000
    annualRateBps: 1150, // 11.50%
    tenureMonths: 36,
    emiMinor: 720000, // ₹7,200
    startDate: '2024-05-15',
    nextDueDate: '2026-11-15',
    linkedAccountId: salaryBank.id,
  });

  createLoan(db, {
    name: 'Education Assist Loan',
    counterparty: 'Arjun Verma (Cousin)',
    scope: 'family',
    direction: 'lent',
    principalMinor: 15000000, // ₹1,50,000
    remainingMinor: 12000000, // ₹1,20,000
    annualRateBps: 0, // 0% interest family assist
    tenureMonths: 30,
    emiMinor: 500000, // ₹5,000
    startDate: '2025-01-01',
    nextDueDate: '2026-11-25',
    linkedAccountId: salaryBank.id,
  });

  // 4. People Dues (Khatabook)
  createPersonDue(db, {
    personName: 'Rahul Sharma',
    phone: '+919876543210',
    direction: 'give',
    scope: 'personal',
    amountMinor: 250000, // ₹2,500
    dueDate: today,
    note: 'Dinner bill split settlement pending',
  });

  createPersonDue(db, {
    personName: 'Pooja Verma',
    phone: '+919812345678',
    direction: 'need',
    scope: 'personal',
    amountMinor: 400000, // ₹4,000
    dueDate: today,
    note: 'Concert ticket booking advance to receive',
  });

  createPersonDue(db, {
    personName: 'Amit Patel',
    phone: '+919823456789',
    direction: 'need',
    scope: 'personal',
    amountMinor: 1500000, // ₹15,000
    dueDate: '2026-11-20',
    note: 'Shared Goa trip Airbnb villa deposit',
  });

  createPersonDue(db, {
    personName: 'Priya Nair',
    phone: '+919834567890',
    direction: 'give',
    scope: 'personal',
    amountMinor: 120000, // ₹1,200
    dueDate: '2026-11-18',
    note: 'Office team lunch Swiggy split',
  });

  createPersonDue(db, {
    personName: 'Vikram Singh',
    phone: '+919845678901',
    direction: 'need',
    scope: 'personal',
    amountMinor: 2500000, // ₹25,000
    dueDate: '2026-11-30',
    note: 'Short term assist for laptop repair',
  });

  createPersonDue(db, {
    personName: 'Ananya Sen',
    phone: '+919856789012',
    direction: 'give',
    scope: 'family',
    amountMinor: 550000, // ₹5,500
    dueDate: '2026-12-05',
    note: 'Amazon Prime & Netflix annual pool share',
  });

  createPersonDue(db, {
    personName: 'Rajesh Gupta',
    phone: '+919867890123',
    direction: 'need',
    scope: 'business',
    amountMinor: 800000, // ₹8,000
    dueDate: '2026-11-22',
    note: 'Freelance design sprint milestone advance',
  });

  createPersonDue(db, {
    personName: 'Sneha Joshi',
    phone: '+919878901234',
    direction: 'need',
    scope: 'personal',
    amountMinor: 300000, // ₹3,000
    dueDate: '2026-10-15',
    note: 'Birthday gift pool contribution (settled)',
  });

  // 5. Notes & Checklists
  upsertNote(db, null, {
    title: 'Monthly Financial Routine & Checklist',
    body: 'Essential monthly ledger checklist for personal and family budget health.',
    scope: 'personal',
    color: 'sky',
    pinned: true,
    tags: ['finance', 'monthly', 'checklist'],
    checklist: [
      { text: 'Pay ICICI Credit Card outstanding before 5th', done: false },
      { text: 'Verify Mutual Fund SIP debit in HDFC account', done: true },
      { text: 'Settle dinner split balance with Rahul', done: false },
      { text: 'Review AI Advisor subscription leak alerts', done: false },
    ],
  });

  upsertNote(db, null, {
    title: 'Tax Deductions FY26-27 (CA Tax Pack)',
    body: 'Section 80C, 80D, and NPS contribution documents list for tax filing.',
    scope: 'personal',
    color: 'mint',
    pinned: false,
    tags: ['tax', 'ca-pack', 'exemptions'],
    checklist: [
      { text: 'ELSS Mutual Fund statement from Groww', done: true },
      { text: 'Health insurance premium receipt (80D)', done: false },
      { text: 'NPS Tier-1 statement download', done: false },
      { text: 'Home loan principal & interest certificate', done: false },
    ],
  });

  // 6. Recurring Bills
  createRecurringBill(db, {
    title: 'Airtel Fiber Broadband',
    scope: 'personal',
    kind: 'expense',
    accountId: salaryBank.id,
    category: 'Utilities',
    amountMinor: 117900,
    dueDay: 10,
    active: true,
    autoPost: true,
  });

  createRecurringBill(db, {
    title: 'Nippon India Small Cap SIP',
    scope: 'personal',
    kind: 'expense',
    accountId: salaryBank.id,
    category: 'Investment',
    amountMinor: 500000,
    dueDay: 5,
    active: true,
    autoPost: false,
  });

  return {
    accountsCount: 14,
    txCount: seededTxCount,
    loansCount: 4,
    duesCount: 8,
    notesCount: 2,
    billsCount: 2,
  };
}
