import { DatabaseSync } from 'node:sqlite';
import { createAccount } from './accounts-repo.ts';
import { createTransaction, createLoan, createPersonDue, createRecurringBill } from './ledger-repo.ts';
import { upsertNote } from './notes-repo.ts';
import { todayISO } from '../../shared/ledger-core.ts';

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
    name: 'HDFC Salary Bank',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'personal',
    institution: 'HDFC Bank',
    last4: '4192',
    openingBalanceMinor: 12500000, // ₹1,25,000.00
  });

  createAccount(db, {
    name: 'ICICI Wealth Savings',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'personal',
    institution: 'ICICI Bank',
    last4: '9321',
    openingBalanceMinor: 4500000, // ₹45,000.00
  });

  createAccount(db, {
    name: 'SBI Personal Account',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'family',
    institution: 'State Bank of India',
    last4: '7810',
    openingBalanceMinor: 3200000, // ₹32,000.00
  });

  createAccount(db, {
    name: 'Kotak 811 Zero-Bal',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'personal',
    institution: 'Kotak Mahindra Bank',
    last4: '3319',
    openingBalanceMinor: 1500000, // ₹15,000.00
  });

  createAccount(db, {
    name: 'Axis Current Account',
    type: 'bank',
    accountGroup: 'bank',
    scope: 'business',
    institution: 'Axis Bank',
    last4: '5521',
    openingBalanceMinor: 8500000, // ₹85,000.00
  });

  // Credit Cards
  const creditCard = createAccount(db, {
    name: 'ICICI Amazon Pay Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'ICICI Bank',
    last4: '8831',
    openingBalanceMinor: 0,
    creditLimitMinor: 15000000, // ₹1,50,000 limit
    statementDay: 15,
    dueDay: 5,
  });

  const hdfcRegalia = createAccount(db, {
    name: 'HDFC Regalia Gold',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'HDFC Bank',
    last4: '2049',
    openingBalanceMinor: 0,
    creditLimitMinor: 30000000, // ₹3,00,000 limit
    statementDay: 18,
    dueDay: 8,
  });

  createAccount(db, {
    name: 'SBI Cashback Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'SBI Cards',
    last4: '6712',
    openingBalanceMinor: 0,
    creditLimitMinor: 10000000, // ₹1,00,000 limit
    statementDay: 12,
    dueDay: 2,
  });

  const axisFlipkart = createAccount(db, {
    name: 'Axis Flipkart Card',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'Axis Bank',
    last4: '4920',
    openingBalanceMinor: 0,
    creditLimitMinor: 12000000, // ₹1,20,000 limit
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
    openingBalanceMinor: 0,
    creditLimitMinor: 40000000, // ₹4,00,000 limit
    statementDay: 25,
    dueDay: 15,
  });

  createAccount(db, {
    name: 'OneCard Metal',
    type: 'credit_card',
    accountGroup: 'credit_card',
    scope: 'personal',
    institution: 'Federal Bank',
    last4: '9982',
    openingBalanceMinor: 0,
    creditLimitMinor: 8000000, // ₹80,000 limit
    statementDay: 10,
    dueDay: 28,
  });

  // Wallets & Cash
  const wallet = createAccount(db, {
    name: 'Cash & UPI Wallet',
    type: 'bank',
    accountGroup: 'cash',
    scope: 'personal',
    institution: 'Cash',
    last4: '0000',
    openingBalanceMinor: 850000, // ₹8,500.00
  });

  const paytmWallet = createAccount(db, {
    name: 'Paytm Wallet',
    type: 'bank',
    accountGroup: 'wallet',
    scope: 'personal',
    institution: 'Paytm Payments',
    last4: '1288',
    openingBalanceMinor: 420000, // ₹4,200.00
  });

  createAccount(db, {
    name: 'Amazon Pay Balance',
    type: 'bank',
    accountGroup: 'wallet',
    scope: 'personal',
    institution: 'Amazon',
    last4: '9002',
    openingBalanceMinor: 150000, // ₹1,500.00
  });

  // 2. Transactions
  const today = todayISO();
  const txData = [
    { kind: 'income' as const, category: 'Salary', amountMinor: 9500000, party: 'TechCorp India', note: 'Monthly Salary Credit', accountId: salaryBank.id },
    { kind: 'expense' as const, category: 'Groceries', amountMinor: 345000, party: 'Reliance Smart', note: 'Weekly household groceries', accountId: creditCard.id },
    { kind: 'expense' as const, category: 'Dining', amountMinor: 128000, party: 'Social Cafe', note: 'Team lunch outing', accountId: creditCard.id },
    { kind: 'expense' as const, category: 'Flight Tickets', amountMinor: 1850000, party: 'MakeMyTrip', note: 'Business flight booking', accountId: amexTravel.id },
    { kind: 'expense' as const, category: 'Electronics', amountMinor: 420000, party: 'Croma Retail', note: 'Noise cancelling headphones', accountId: hdfcRegalia.id },
    { kind: 'expense' as const, category: 'Utilities', amountMinor: 215000, party: 'Tata Power', note: 'Electricity bill payment', accountId: salaryBank.id },
    { kind: 'expense' as const, category: 'Fuel', amountMinor: 250000, party: 'Indian Oil', note: 'Car petrol refill', accountId: salaryBank.id },
    { kind: 'expense' as const, category: 'Entertainment', amountMinor: 64900, party: 'Netflix India', note: 'Premium subscription', accountId: creditCard.id },
    { kind: 'expense' as const, category: 'Online Shopping', amountMinor: 89000, party: 'Flipkart', note: 'Books & stationery', accountId: axisFlipkart.id },
    { kind: 'expense' as const, category: 'Health', amountMinor: 145000, party: 'Apollo Pharmacy', note: 'Routine vitamins & medicines', accountId: wallet.id },
    { kind: 'expense' as const, category: 'Dining', amountMinor: 25000, party: 'Chai Point', note: 'Tea & snacks', accountId: wallet.id },
    { kind: 'expense' as const, category: 'Cab & Auto', amountMinor: 38000, party: 'Uber India', note: 'Client office commute', accountId: paytmWallet.id },
  ];

  for (const tx of txData) {
    createTransaction(db, {
      kind: tx.kind,
      scope: 'personal',
      accountId: tx.accountId,
      category: tx.category,
      amountMinor: tx.amountMinor,
      occurredAt: today,
      party: tx.party,
      note: tx.note,
    });
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
    txCount: txData.length,
    loansCount: 4,
    duesCount: 8,
    notesCount: 2,
    billsCount: 2,
  };
}
