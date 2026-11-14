export const APP_LANGUAGES = ['en', 'hi', 'bn'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const LANGUAGE_META: Record<
  AppLanguage,
  { code: AppLanguage; label: string; nativeLabel: string; speechLocale: string }
> = {
  en: { code: 'en', label: 'English', nativeLabel: 'English', speechLocale: 'en-IN' },
  hi: { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', speechLocale: 'hi-IN' },
  bn: { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', speechLocale: 'bn-IN' },
};

export interface UiDictionary {
  appName: string;
  scopesSubtitle: string;
  quickAdd: string;
  aiAgent: string;
  whatsappLinked: string;
  whatsappBridge: string;
  systemLanguage: string;
  tabs: {
    dashboard: string;
    cards: string;
    money: string;
    loans_dues: string;
    reports: string;
    notes: string;
    vault: string;
  };
  scopes: {
    all: string;
    personal: string;
    business: string;
    family: string;
  };
  dashboard: {
    netWorth: string;
    banksByScope: string;
    thisMonthCashflow: string;
    income: string;
    expense: string;
    monthlyNet: string;
    creditAndDues: string;
    cardsOutstanding: string;
    needFromPeople: string;
    giveToPeople: string;
    sixMonthCashflow: string;
    fullReports: string;
    monthlySpendMix: string;
    actionNeeded: string;
    noAttentionItems: string;
    creditCards: string;
    manageCards: string;
    peopleNetBalances: string;
    allDuesLoans: string;
    pinnedChecklists: string;
    openNotes: string;
    readyTitle: string;
    readySubtitle: string;
    addBankCard: string;
    quickCapture: string;
    referenceDate: string;
  };
  agent: {
    title: string;
    subtitle: string;
    placeholder: string;
    send: string;
    thinking: string;
    confirmRun: string;
    cancel: string;
    autoExecuteLabel: string;
    voiceInput: string;
    voiceAutoBadge: string;
    listening: string;
    commandLangLabel: string;
    systemLangLabel: string;
    settingsTitle: string;
    providerLocal: string;
    providerGemini: string;
    providerOpenAI: string;
    apiKeyPlaceholder: string;
    saveSettings: string;
    clearHistory: string;
    welcomeMessage: string;
    examplesTitle: string;
    examples: string[];
    advisorTitle: string;
    healthLabel: string;
    projected30dLabel: string;
    btnAssess: string;
    btnWrong: string;
    btnPredict: string;
    btnClean: string;
    recommendedActions: string;
    askAdvisorBtn: string;
    upcoming30dLabel: string;
    openTasksLabel: string;
    whatsWrongShort: string;
    predictionsShort: string;
  };
  common: {
    save: string;
    saving: string;
    cancel: string;
    edit: string;
    delete: string;
    confirmDeleteTitle: string;
    confirmDeleteMsg: string;
    close: string;
    search: string;
    allScopes: string;
    showAll: string;
    showLess: string;
    gridView: string;
    listView: string;
    sortBy: string;
  };
  money: {
    tabTx: string;
    tabBanks: string;
    tabCards: string;
    tabRecurring: string;
    addBank: string;
    addCard: string;
    recordTitle: string;
    addTxBtn: string;
    editTxTitle: string;
    editAccTitle: string;
    editRecTitle: string;
    unifiedLedger: string;
    reconcile: string;
    payBill: string;
    recurringTitle: string;
    newTemplate: string;
    confirmPaid: string;
    budgetsTitle: string;
    budgetsSubtitle: string;
  };
  loansDues: {
    tabLoans: string;
    tabDues: string;
    addDue: string;
    addLoan: string;
    editLoan: string;
    editDue: string;
    recordEmi: string;
    settle: string;
    nudge: string;
  };
  reports: {
    from: string;
    to: string;
    exportCsv: string;
    printPdf: string;
    tabPnl: string;
    tabCategories: string;
    tabCards: string;
    tabBanks: string;
    tabLoans: string;
    tabDues: string;
  };
  notes: {
    title: string;
    newNote: string;
    takeNote: string;
    tabActive: string;
    tabReminders: string;
    tabChecklists: string;
    tabArchive: string;
    archive: string;
    unarchive: string;
    pinnedSection: string;
    othersSection: string;
    createTitle: string;
    editTitle: string;
    deleteNote: string;
    saveChanges: string;
    createNote: string;
    pinLabel: string;
    reminderLabel: string;
  };
  vault: {
    unlockTitle: string;
    setupTitle: string;
    unlockBtn: string;
    createBtn: string;
    unlockedBanner: string;
    addLogin: string;
    lockNow: string;
    changeMasterBtn: string;
    changeMasterTitle: string;
    editRotate: string;
    tabStarred: string;
    tabAll: string;
    viewSecrets: string;
    hideSecrets: string;
    addSecret: string;
    legacyTitle: string;
    archiveToLegacy: string;
  };
  quickAddModal: {
    title: string;
    saveEntry: string;
  };
  alerts: {
    title: string;
    tabWhatsapp: string;
    tabInbox: string;
    tabBackup: string;
    restoreTitle: string;
    restoreBtn: string;
  };
  commandPalette: {
    title: string;
    placeholder: string;
    quickActions: string;
    workspaces: string;
    noResults: string;
    shortcutHint: string;
  };
}

export const UI_STRINGS: Record<AppLanguage, UiDictionary> = {
  en: {
    appName: 'Personal Ledger',
    scopesSubtitle: 'Personal · Business · Family',
    quickAdd: 'Quick Add',
    aiAgent: 'AI Agent',
    whatsappLinked: 'WhatsApp: Linked',
    whatsappBridge: 'WhatsApp: Bridge',
    systemLanguage: 'System Language',
    tabs: {
      dashboard: 'Dashboard',
      cards: 'Credit Cards',
      money: 'Bank & Cash',
      loans_dues: 'Loans & Dues',
      reports: 'Reports',
      notes: 'Notes',
      vault: 'Vault',
    },
    scopes: {
      all: 'All Scopes',
      personal: 'Personal',
      business: 'Business',
      family: 'Family',
    },
    dashboard: {
      netWorth: 'Net Worth',
      banksByScope: 'Banks by Scope',
      thisMonthCashflow: 'This Month Cashflow',
      income: 'Income',
      expense: 'Expense',
      monthlyNet: 'Monthly Net',
      creditAndDues: 'Credit & People Dues',
      cardsOutstanding: 'Cards Outstanding',
      needFromPeople: 'Need from People',
      giveToPeople: 'Give to People',
      sixMonthCashflow: '6-Month Cashflow',
      fullReports: 'Full Reports',
      monthlySpendMix: 'Monthly Spend Mix',
      actionNeeded: 'Action Needed',
      noAttentionItems: 'No overdue bills, EMIs, or low balances right now.',
      creditCards: 'Credit Cards',
      manageCards: 'Manage Cards',
      peopleNetBalances: 'People Net Balances',
      allDuesLoans: 'All Dues & Loans',
      pinnedChecklists: 'Pinned Checklists & Notes',
      openNotes: 'Open Notes',
      readyTitle: 'Your Personal Ledger is Ready',
      readySubtitle:
        'Start by adding your Personal, Business, or Family bank accounts and credit cards in Money & Cards, or command the AI Agent.',
      addBankCard: 'Add Bank / Card',
      quickCapture: 'Quick Capture',
      referenceDate: 'Reference date',
    },
    agent: {
      title: 'Personal AI Agent',
      subtitle: 'Command in Bengali, Hindi, or English — acts in your System Language',
      placeholder: 'Type or speak a command in বাংলা, हिन्दी, or English...',
      send: 'Run',
      thinking: 'Working...',
      confirmRun: 'Confirm & Execute',
      cancel: 'Cancel',
      autoExecuteLabel: 'Auto-execute commands',
      voiceInput: 'Auto Voice',
      voiceAutoBadge: 'Auto-detect (বাংলা · हिन्दी · EN)',
      listening: 'Listening...',
      commandLangLabel: 'Command',
      systemLangLabel: 'System',
      settingsTitle: 'AI Brain & Language',
      providerLocal: 'Built-in Offline Multilingual (EN / HI / BN)',
      providerGemini: 'Gemini API (Optional upgrade)',
      providerOpenAI: 'OpenAI-compatible API (Optional)',
      apiKeyPlaceholder: 'Optional API key (leave blank for built-in)',
      saveSettings: 'Save Agent Settings',
      clearHistory: 'Clear Chat',
      welcomeMessage:
        'I am your Personal Human Assistant & Advisor. Ask me to assess your finances, predict the next 30 days, spot what went wrong, or run multi-step commands in EN, HI, or BN.',
      examplesTitle: 'Try a command in any language',
      examples: [
        'Assess my finances & what needs attention',
        'Predict my 30-day cashflow and risks',
        'Spend ₹500 on groceries in Personal; check alerts',
        'রাহুলের কাছে ১৫০০ টাকা পাবো যোগ করো',
        'আজ পার্সোনাল 500 টাকা খাবার খরচ লিখো',
      ],
      advisorTitle: 'Human Advisor & Daily Briefing',
      healthLabel: 'Health Score',
      projected30dLabel: '30d Safe Cash',
      btnAssess: 'Assess All',
      btnWrong: "What's Wrong?",
      btnPredict: '30d Forecast',
      btnClean: 'Clean Done Tasks',
      recommendedActions: '1-Click Advisor Actions',
      askAdvisorBtn: 'Open Assistant',
      upcoming30dLabel: '30d Bills & EMIs',
      openTasksLabel: 'Open Tasks',
      whatsWrongShort: 'Needs Attention',
      predictionsShort: '30-Day Outlook',
    },
    common: {
      save: 'Save',
      saving: 'Saving...',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      confirmDeleteTitle: 'Confirm Delete',
      confirmDeleteMsg: 'This action permanently removes the selected item. Continue?',
      close: 'Close',
      search: 'Search...',
      allScopes: 'All Scopes',
      showAll: 'Show All',
      showLess: 'Show Less',
      gridView: 'Grid',
      listView: 'List',
      sortBy: 'Sort',
    },
    money: {
      tabTx: 'Transactions',
      tabBanks: 'Banks (P / B / F)',
      tabCards: 'Credit Cards & Bills',
      tabRecurring: 'Recurring & Budgets',
      addBank: 'Add Bank',
      addCard: 'Add Card',
      recordTitle: 'Record Income / Expense / Transfer',
      addTxBtn: 'Add Transaction',
      editTxTitle: 'Edit Transaction',
      editAccTitle: 'Edit Account / Card',
      editRecTitle: 'Edit Recurring Template',
      unifiedLedger: 'Unified Ledger',
      reconcile: 'Reconcile',
      payBill: 'Pay Bill',
      recurringTitle: 'Recurring Monthly Bills & Income',
      newTemplate: 'New Template',
      confirmPaid: 'Confirm Paid',
      budgetsTitle: 'Monthly Scope Budgets',
      budgetsSubtitle: 'Alerts fire at 80% and 100% spend per scope',
    },
    loansDues: {
      tabLoans: 'Loan Tracking & EMIs',
      tabDues: 'People Dues (Give / Need)',
      addDue: 'Add Due (Give / Need)',
      addLoan: 'Add Loan',
      editLoan: 'Edit Loan',
      editDue: 'Edit People Due',
      recordEmi: 'Record EMI / Payment',
      settle: 'Settle',
      nudge: 'Nudge',
    },
    reports: {
      from: 'From',
      to: 'To',
      exportCsv: 'Export CSV',
      printPdf: 'Print / PDF',
      tabPnl: 'Cashflow & Scope P&L',
      tabCategories: 'Category Breakdown',
      tabCards: 'Credit Card Bills',
      tabBanks: 'Bank Ledger & Net Worth',
      tabLoans: 'Loan Summary',
      tabDues: 'People Dues Aging',
    },
    notes: {
      title: 'Notes & Checklists',
      newNote: 'New Note',
      takeNote: 'Take a note or checklist...',
      tabActive: 'Active',
      tabReminders: 'Reminders',
      tabChecklists: 'Checklists',
      tabArchive: 'Archive',
      archive: 'Archive',
      unarchive: 'Unarchive',
      pinnedSection: 'Pinned',
      othersSection: 'Others',
      createTitle: 'Create Note & Checklist',
      editTitle: 'Edit Note & Checklist',
      deleteNote: 'Delete Note',
      saveChanges: 'Save Changes',
      createNote: 'Create Note',
      pinLabel: 'Pin to top & Dashboard',
      reminderLabel: 'WhatsApp Reminder Time (optional)',
    },
    vault: {
      unlockTitle: 'Unlock Password Vault',
      setupTitle: 'Initialize Master Password',
      unlockBtn: 'Unlock Vault',
      createBtn: 'Create Encrypted Vault',
      unlockedBanner: 'Vault Unlocked in Memory',
      addLogin: 'Add Login',
      lockNow: 'Lock Now',
      changeMasterBtn: 'Master Key',
      changeMasterTitle: 'Change Vault Master Password',
      editRotate: 'Edit / Rotate',
      tabStarred: 'Starred',
      tabAll: 'All',
      viewSecrets: 'View Secrets',
      hideSecrets: 'Hide Secrets',
      addSecret: 'Add PIN / Secret',
      legacyTitle: 'Legacy / Archived PINs & Passwords',
      archiveToLegacy: 'Archive Old to Legacy',
    },
    quickAddModal: {
      title: 'Quick Capture',
      saveEntry: 'Save Entry',
    },
    alerts: {
      title: 'WhatsApp QR Bridge, Module Alerts & Backup',
      tabWhatsapp: 'WhatsApp QR & Rules',
      tabInbox: 'Alert Delivery Log',
      tabBackup: 'Backup & Auto-Wakeup',
      restoreTitle: 'Restore Full Ledger Backup (JSON)',
      restoreBtn: 'Restore Selected Backup',
    },
    commandPalette: {
      title: 'Command Palette',
      placeholder: 'Type a command, search workspace, or take an action...',
      quickActions: 'Quick Actions',
      workspaces: 'Workspaces',
      noResults: 'No commands or workspaces found',
      shortcutHint: 'Navigate with ↑↓, press Enter to select, Esc to close',
    },
  },
  hi: {
    appName: 'पर्सनल लेजर',
    scopesSubtitle: 'पर्सनल · बिज़नेस · फ़ैमिली',
    quickAdd: 'त्वरित जोड़ें',
    aiAgent: 'AI एजेंट',
    whatsappLinked: 'WhatsApp: जुड़ा है',
    whatsappBridge: 'WhatsApp: ब्रिज',
    systemLanguage: 'सिस्टम भाषा',
    tabs: {
      dashboard: 'डैशबोर्ड',
      cards: 'क्रेडिट कार्ड',
      money: 'बैंक और नकद',
      loans_dues: 'लोन और उधार',
      reports: 'रिपोर्ट्स',
      notes: 'नोट्स',
      vault: 'वॉल्ट',
    },
    scopes: {
      all: 'सभी स्कोप',
      personal: 'पर्सनल',
      business: 'बिज़नेस',
      family: 'फ़ैमिली',
    },
    dashboard: {
      netWorth: 'कुल नेट वर्थ',
      banksByScope: 'स्कोप के अनुसार बैंक',
      thisMonthCashflow: 'इस माह का कैशफ्लो',
      income: 'आय',
      expense: 'खर्च',
      monthlyNet: 'मासिक शुद्ध',
      creditAndDues: 'कार्ड और उधार',
      cardsOutstanding: 'कार्ड बकाया',
      needFromPeople: 'लोगों से लेना है',
      giveToPeople: 'लोगों को देना है',
      sixMonthCashflow: '6 महीने का कैशफ्लो',
      fullReports: 'पूरी रिपोर्ट',
      monthlySpendMix: 'मासिक खर्च वितरण',
      actionNeeded: 'ध्यान देने योग्य',
      noAttentionItems: 'अभी कोई बकाया बिल, EMI या कम बैलेंस नहीं है।',
      creditCards: 'क्रेडिट कार्ड',
      manageCards: 'कार्ड देखें',
      peopleNetBalances: 'लोगों का शुद्ध हिसाब',
      allDuesLoans: 'सभी लोन और उधार',
      pinnedChecklists: 'पिन किए गए चेकलिस्ट और नोट्स',
      openNotes: 'नोट्स खोलें',
      readyTitle: 'आपका पर्सनल लेजर तैयार है',
      readySubtitle:
        'पैसे और कार्ड टैब में अपने पर्सनल, बिज़नेस या फ़ैमिली बैंक व कार्ड जोड़ें, या AI एजेंट को कमांड दें।',
      addBankCard: 'बैंक / कार्ड जोड़ें',
      quickCapture: 'त्वरित एंट्री',
      referenceDate: 'तारीख',
    },
    agent: {
      title: 'पर्सनल AI एजेंट',
      subtitle: 'বাংলা, हिन्दी या English में बोलें/लिखें — काम सिस्टम भाषा में होगा',
      placeholder: 'বাংলা, हिन्दी या English में कमांड लिखें...',
      send: 'चलाएं',
      thinking: 'काम हो रहा है...',
      confirmRun: 'पुष्टि करें और चलाएं',
      cancel: 'रद्द करें',
      autoExecuteLabel: 'सीधे कमांड चलाएं',
      voiceInput: 'ऑटो वॉइस',
      voiceAutoBadge: 'स्वतः पहचान (বাংলা · हिन्दी · EN)',
      listening: 'सुन रहा हूँ...',
      commandLangLabel: 'कमांड',
      systemLangLabel: 'सिस्टम',
      settingsTitle: 'AI इंजन और भाषा',
      providerLocal: 'बिल्ट-इन ऑफ़लाइन मल्टीलिंगुअल (EN / HI / BN)',
      providerGemini: 'Gemini API (वैकल्पिक)',
      providerOpenAI: 'OpenAI-compatible API (वैकल्पिक)',
      apiKeyPlaceholder: 'वैकल्पिक API key (खाली छोड़ें बिल्ट-इन के लिए)',
      saveSettings: 'सेटिंग्स सेव करें',
      clearHistory: 'चैट साफ़ करें',
      welcomeMessage:
        'मैं आपका पर्सनल असिस्टेंट और सलाहकार हूँ। अपने काम की समीक्षा, क्या गलत है, अगले 30 दिनों का अनुमान या हिंदी/বাংলা/English में कोई भी काम मुझसे करवाएं।',
      examplesTitle: 'किसी भी भाषा में कमांड आज़माएं',
      examples: [
        'मेरा पूरा हिसाब और क्या गलत है बताओ',
        'अगले 30 दिनों का भविष्य अनुमान बताओ',
        'मेरे सारे बैंक बैलेंस और नेट वर्थ बताओ',
        'আজ পার্সোনাল ৫০০ টাকা খাবার খরচ লেখো',
        'राहुल से 1500 रुपये लेने हैं जोड़ो',
      ],
      advisorTitle: 'ह्यूमन एडवाइज़र व डेली ब्रीफ़िंग',
      healthLabel: 'हेल्थ स्कोर',
      projected30dLabel: '30-दिन सुरक्षित नकद',
      btnAssess: 'पूरी समीक्षा',
      btnWrong: 'क्या गलत है?',
      btnPredict: '30-दिन अनुमान',
      btnClean: 'काम साफ़ करें',
      recommendedActions: '1-क्लिक सलाह कार्रवाई',
      askAdvisorBtn: 'असिस्टेंट खोलें',
      upcoming30dLabel: '30-दिन बिल/EMI',
      openTasksLabel: 'बाकी काम',
      whatsWrongShort: 'ध्यान देने योग्य',
      predictionsShort: '30-दिन अनुमान',
    },
    common: {
      save: 'सेव करें',
      saving: 'सेव हो रहा है...',
      cancel: 'रद्द करें',
      edit: 'बदलें',
      delete: 'हटाएं',
      confirmDeleteTitle: 'हटाने की पुष्टि करें',
      confirmDeleteMsg: 'यह आइटम स्थायी रूप से हटा दिया जाएगा। क्या आप आगे बढ़ना चाहते हैं?',
      close: 'बंद करें',
      search: 'खोजें...',
      allScopes: 'सभी स्कोप',
      showAll: 'सभी दिखाएं',
      showLess: 'कम दिखाएं',
      gridView: 'ग्रिड',
      listView: 'सूची',
      sortBy: 'क्रम',
    },
    money: {
      tabTx: 'लेन-देन',
      tabBanks: 'बैंक (P / B / F)',
      tabCards: 'क्रेडिट कार्ड और बिल',
      tabRecurring: 'रिवकरिंग और बजट',
      addBank: 'बैंक जोड़ें',
      addCard: 'कार्ड जोड़ें',
      recordTitle: 'आय / खर्च / ट्रांसफर दर्ज करें',
      addTxBtn: 'लेन-देन जोड़ें',
      editTxTitle: 'लेन-देन संपादित करें',
      editAccTitle: 'खाता / कार्ड संपादित करें',
      editRecTitle: 'रिवकरिंग टेम्पलेट संपादित करें',
      unifiedLedger: 'संयुक्त खाता बही',
      reconcile: 'बैलेंस मिलाएं',
      payBill: 'बिल भरें',
      recurringTitle: 'मासिक रिवकरिंग बिल और आय',
      newTemplate: 'नया टेम्पलेट',
      confirmPaid: 'भुगतान दर्ज करें',
      budgetsTitle: 'मासिक स्कोप बजट',
      budgetsSubtitle: '80% और 100% खर्च पर अलर्ट भेजता है',
    },
    loansDues: {
      tabLoans: 'लोन और EMI ट्रैकिंग',
      tabDues: 'लोगों का उधार (लेना / देना)',
      addDue: 'उधार जोड़ें',
      addLoan: 'लोन जोड़ें',
      editLoan: 'लोन संपादित करें',
      editDue: 'उधार संपादित करें',
      recordEmi: 'EMI / भुगतान दर्ज करें',
      settle: 'हिसाब चुकता',
      nudge: 'रिमाइंडर',
    },
    reports: {
      from: 'से',
      to: 'तक',
      exportCsv: 'CSV डाउनलोड',
      printPdf: 'प्रिंट / PDF',
      tabPnl: 'कैशफ्लो और P&L',
      tabCategories: 'श्रेणी विभाजन',
      tabCards: 'क्रेडिट कार्ड बिल',
      tabBanks: 'बैंक लेजर और नेट वर्थ',
      tabLoans: 'लोन रिपोर्ट',
      tabDues: 'उधार अवधि रिपोर्ट',
    },
    notes: {
      title: 'नोट्स और चेकलिस्ट',
      newNote: 'नया नोट',
      takeNote: 'नोट या चेकलिस्ट लिखें...',
      tabActive: 'सक्रिय',
      tabReminders: 'रिमाइंडर',
      tabChecklists: 'चेकलिस्ट',
      tabArchive: 'आर्काइव',
      archive: 'आर्काइव करें',
      unarchive: 'वापस लाएं',
      pinnedSection: 'पिन किए गए',
      othersSection: 'अन्य',
      createTitle: 'नोट और चेकलिस्ट बनाएं',
      editTitle: 'नोट और चेकलिस्ट संपादित करें',
      deleteNote: 'नोट हटाएं',
      saveChanges: 'बदलाव सेव करें',
      createNote: 'नोट बनाएं',
      pinLabel: 'ऊपर और डैशबोर्ड पर पिन करें',
      reminderLabel: 'WhatsApp रिमाइंडर समय (वैकल्पिक)',
    },
    vault: {
      unlockTitle: 'पासवर्ड वॉल्ट अनलॉक करें',
      setupTitle: 'मास्टर पासवर्ड सेट करें',
      unlockBtn: 'वॉल्ट खोलें',
      createBtn: 'एन्क्रिप्टेड वॉल्ट बनाएं',
      unlockedBanner: 'वॉल्ट मेमोरी में खुला है',
      addLogin: 'लॉगिन जोड़ें',
      lockNow: 'लॉक करें',
      changeMasterBtn: 'मास्टर पासवर्ड',
      changeMasterTitle: 'वॉल्ट मास्टर पासवर्ड बदलें',
      editRotate: 'बदलें / रोटेट',
      tabStarred: 'स्टार किए गए',
      tabAll: 'सभी',
      viewSecrets: 'सीक्रेट्स देखें',
      hideSecrets: 'छुपाएं',
      addSecret: 'पिन / सीक्रेट जोड़ें',
      legacyTitle: 'पुराने / आर्काइव पिन व पासवर्ड',
      archiveToLegacy: 'पुराने को लेगेसी में सेव करें',
    },
    quickAddModal: {
      title: 'त्वरित एंट्री',
      saveEntry: 'एंट्री सेव करें',
    },
    alerts: {
      title: 'WhatsApp QR ब्रिज, अलर्ट और बैकअप',
      tabWhatsapp: 'WhatsApp QR और नियम',
      tabInbox: 'अलर्ट लॉग',
      tabBackup: 'बैकअप और ऑटो-वेकअप',
      restoreTitle: 'बैकअप वापस लोड करें (JSON)',
      restoreBtn: 'बैकअप रीस्टोर करें',
    },
    commandPalette: {
      title: 'कमांड पैलेट',
      placeholder: 'कमांड टाइप करें, कार्यक्षेत्र खोजें या कार्रवाई चुनें...',
      quickActions: 'त्वरित कार्रवाइयाँ',
      workspaces: 'कार्यक्षेत्र',
      noResults: 'कोई कमांड या कार्यक्षेत्र नहीं मिला',
      shortcutHint: '↑↓ से नेविगेट करें, चुनने के लिए Enter दबाएं, बंद करने के लिए Esc',
    },
  },
  bn: {
    appName: 'পার্সোনাল লেজার',
    scopesSubtitle: 'পার্সোনাল · বিজনেস · ফ্যামিলি',
    quickAdd: 'দ্রুত যোগ',
    aiAgent: 'AI এজেন্ট',
    whatsappLinked: 'WhatsApp: যুক্ত',
    whatsappBridge: 'WhatsApp: ব্রিজ',
    systemLanguage: 'সিস্টেম ভাষা',
    tabs: {
      dashboard: 'ড্যাশবোর্ড',
      cards: 'ক্রেডিট কার্ড',
      money: 'ব্যাংক ও ক্যাশ',
      loans_dues: 'ঋণ ও বকেয়া',
      reports: 'রিপোর্ট',
      notes: 'নোটস',
      vault: 'ভল্ট',
    },
    scopes: {
      all: 'সব স্কোপ',
      personal: 'পার্সোনাল',
      business: 'বিজনেস',
      family: 'ফ্যামিলি',
    },
    dashboard: {
      netWorth: 'মোট নেট ওয়ার্থ',
      banksByScope: 'স্কোপ অনুযায়ী ব্যাংক',
      thisMonthCashflow: 'এই মাসের ক্যাশফ্লো',
      income: 'আয়',
      expense: 'খরচ',
      monthlyNet: 'মাসিক নিট',
      creditAndDues: 'ক্রেডিট ও দেনা-পাওনা',
      cardsOutstanding: 'কার্ড বকেয়া',
      needFromPeople: 'মানুষের কাছে পাবো',
      giveToPeople: 'মানুষকে দেবো',
      sixMonthCashflow: '৬ মাসের ক্যাশফ্লো',
      fullReports: 'সব রিপোর্ট',
      monthlySpendMix: 'মাসিক খরচের ভাগ',
      actionNeeded: 'জরুরি কাজ',
      noAttentionItems: 'এই মুহূর্তে কোনো বকেয়া বিল, EMI বা কম ব্যালেন্স নেই।',
      creditCards: 'ক্রেডিট কার্ড',
      manageCards: 'কার্ড দেখুন',
      peopleNetBalances: 'ব্যক্তিগত নিট হিসাব',
      allDuesLoans: 'সব ঋণ ও বকেয়া',
      pinnedChecklists: 'পিন করা চেকলিস্ট ও নোট',
      openNotes: 'নোটস খুলুন',
      readyTitle: 'আপনার পার্সোনাল লেজার প্রস্তুত',
      readySubtitle:
        'টাকা ও কার্ড ট্যাবে আপনার পার্সোনাল, বিজনেস বা ফ্যামিলি ব্যাংক ও কার্ড যোগ করুন, অথবা AI এজেন্টকে কমান্ড দিন।',
      addBankCard: 'ব্যাংক / কার্ড যোগ',
      quickCapture: 'দ্রুত এন্ট্রি',
      referenceDate: 'তারিখ',
    },
    agent: {
      title: 'পার্সোনাল AI এজেন্ট',
      subtitle: 'বাংলা, हिन्दी বা English-এ বলুন — কাজ হবে সিস্টেম ভাষায়',
      placeholder: 'বাংলা, हिन्दी বা English-এ কমান্ড লিখুন...',
      send: 'চালান',
      thinking: 'কাজ চলছে...',
      confirmRun: 'নিশ্চিত করে চালান',
      cancel: 'বাতিল',
      autoExecuteLabel: 'সরাসরি কমান্ড চালান',
      voiceInput: 'অটো ভয়েস',
      voiceAutoBadge: 'স্বয়ংক্রিয় ভাষা (বাংলা · हिन्दी · EN)',
      listening: 'শুনছি...',
      commandLangLabel: 'কমান্ড',
      systemLangLabel: 'সিস্টেম',
      settingsTitle: 'AI ইঞ্জিন ও ভাষা',
      providerLocal: 'বিল্ট-ইন অফলাইন মাল্টিলিঙ্গুয়াল (EN / HI / BN)',
      providerGemini: 'Gemini API (ঐচ্ছিক)',
      providerOpenAI: 'OpenAI-compatible API (ঐচ্ছিক)',
      apiKeyPlaceholder: 'ঐচ্ছিক API key (বিল্ট-ইনের জন্য খালি রাখুন)',
      saveSettings: 'সেটিংস সেভ করুন',
      clearHistory: 'চ্যাট মুছুন',
      welcomeMessage:
        'আমি আপনার ব্যক্তিগত সহকারী ও পরামর্শদাতা। অবস্থা যাচাই, কী ভুল হচ্ছে, ৩০ দিনের পূর্বাভাস বা বাংলা/हिन्दी/English-এ যেকোনো কাজের নির্দেশ দিন।',
      examplesTitle: 'যেকোনো ভাষায় কমান্ড চেষ্টা করুন',
      examples: [
        'আমার পুরো অবস্থা যাচাই করে পরামর্শ দাও',
        'আগামী ৩০ দিনের পূর্বাভাস কী?',
        'আমার মোট ব্যালেন্স আর নেট ওয়ার্থ দেখাও',
        'आज पर्सनल में 500 रुपये खाना खर्च लिखो',
        'রাহুলের কাছে ১৫০০ টাকা পাবো যোগ করো',
      ],
      advisorTitle: 'ব্যক্তিগত পরামর্শদাতা ও দৈনিক রিপোর্ট',
      healthLabel: 'হেলথ স্কোর',
      projected30dLabel: '৩০ দিনের নগদ',
      btnAssess: 'পুরো যাচাই',
      btnWrong: 'কী ভুল আছে?',
      btnPredict: '৩০ দিনের পূর্বাভাস',
      btnClean: 'সম্পন্ন কাজ সরান',
      recommendedActions: '১-ক্লিক পরামর্শ',
      askAdvisorBtn: 'অ্যাসিস্ট্যান্ট খুলুন',
      upcoming30dLabel: '৩০ দিনের বিল/EMI',
      openTasksLabel: 'বাকি কাজ',
      whatsWrongShort: 'নজর দিন',
      predictionsShort: '৩০ দিনের পূর্বাভাস',
    },
    common: {
      save: 'সেভ করুন',
      saving: 'সেভ হচ্ছে...',
      cancel: 'বাতিল',
      edit: 'এডিট',
      delete: 'মুছুন',
      confirmDeleteTitle: 'মোছার আগে নিশ্চিত করুন',
      confirmDeleteMsg: 'এই তথ্যটি স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?',
      close: 'বন্ধ করুন',
      search: 'খুঁজুন...',
      allScopes: 'সব স্কোপ',
      showAll: 'সব দেখুন',
      showLess: 'কম দেখুন',
      gridView: 'গ্রিড',
      listView: 'তালিকা',
      sortBy: 'সাজান',
    },
    money: {
      tabTx: 'লেনদেন',
      tabBanks: 'ব্যাংক (P / B / F)',
      tabCards: 'ক্রেডিট কার্ড ও বিল',
      tabRecurring: 'রিকারিং ও বাজেট',
      addBank: 'ব্যাংক যোগ',
      addCard: 'কার্ড যোগ',
      recordTitle: 'আয় / খরচ / ট্রান্সফার লিখুন',
      addTxBtn: 'লেনদেন যোগ করুন',
      editTxTitle: 'লেনদেন এডিট করুন',
      editAccTitle: 'অ্যাকাউন্ট / কার্ড এডিট করুন',
      editRecTitle: 'রিকারিং টেমপ্লেট এডিট করুন',
      unifiedLedger: 'সব লেনদেনের খাতা',
      reconcile: 'ব্যালেন্স মেলান',
      payBill: 'বিল দিন',
      recurringTitle: 'মাসিক রিকারিং বিল ও আয়',
      newTemplate: 'নতুন টেমপ্লেট',
      confirmPaid: 'পরিশোধ নিশ্চিত',
      budgetsTitle: 'মাসিক স্কোপ বাজেট',
      budgetsSubtitle: '৮০% এবং ১০০% খরচে অ্যালার্ট পাঠানো হয়',
    },
    loansDues: {
      tabLoans: 'ঋণ ও EMI ট্র্যাকিং',
      tabDues: 'ব্যক্তিগত দেনা-পাওনা',
      addDue: 'দেনা-পাওনা যোগ',
      addLoan: 'নতুন ঋণ যোগ',
      editLoan: 'ঋণ এডিট করুন',
      editDue: 'দেনা-পাওনা এডিট করুন',
      recordEmi: 'EMI / কিস্তি জমা',
      settle: 'হিসাব মেটান',
      nudge: 'তাগাদা',
    },
    reports: {
      from: 'শুরু',
      to: 'শেষ',
      exportCsv: 'CSV ডাউনলোড',
      printPdf: 'প্রিন্ট / PDF',
      tabPnl: 'ক্যাশফ্লো ও লাভ-ক্ষতি',
      tabCategories: 'ক্যাটাগরি বিশ্লেষণ',
      tabCards: 'ক্রেডিট কার্ড রিপোর্ট',
      tabBanks: 'ব্যাংক খাতা ও নেট ওয়ার্থ',
      tabLoans: 'ঋণের সারাংশ',
      tabDues: 'বকেয়া সময়সীমা',
    },
    notes: {
      title: 'নোটস ও চেকলিস্ট',
      newNote: 'নতুন নোট',
      takeNote: 'নোট বা চেকলিস্ট লিখুন...',
      tabActive: 'সক্রিয়',
      tabReminders: 'রিমাইন্ডার',
      tabChecklists: 'চেকলিস্ট',
      tabArchive: 'আর্কাইভ',
      archive: 'আর্কাইভ করুন',
      unarchive: 'ফিরিয়ে আনুন',
      pinnedSection: 'পিন করা',
      othersSection: 'অন্যান্য',
      createTitle: 'নোট ও চেকলিস্ট তৈরি করুন',
      editTitle: 'নোট ও চেকলিস্ট এডিট করুন',
      deleteNote: 'নোট মুছুন',
      saveChanges: 'পরিবর্তন সেভ করুন',
      createNote: 'নোট তৈরি করুন',
      pinLabel: 'উপরে ও ড্যাশবোর্ডে পিন করে রাখুন',
      reminderLabel: 'WhatsApp রিমাইন্ডার সময় (ঐচ্ছিক)',
    },
    vault: {
      unlockTitle: 'পাসওয়ার্ড ভল্ট আনলক করুন',
      setupTitle: 'মাস্টার পাসওয়ার্ড সেট করুন',
      unlockBtn: 'ভল্ট খুলুন',
      createBtn: 'এনক্রিপ্টেড ভল্ট তৈরি করুন',
      unlockedBanner: 'ভল্ট মেমরিতে আনলক আছে',
      addLogin: 'লগইন যোগ',
      lockNow: 'লক করুন',
      changeMasterBtn: 'মাস্টার কী',
      changeMasterTitle: 'ভল্ট মাস্টার পাসওয়ার্ড পরিবর্তন',
      editRotate: 'এডিট / রোটেশন',
      tabStarred: 'স্টার করা',
      tabAll: 'সবগুলো',
      viewSecrets: 'পিন/পাসওয়ার্ড দেখুন',
      hideSecrets: 'লুকান',
      addSecret: 'পিন / সিক্রেট যোগ',
      legacyTitle: 'পুরনো / লেগেসি পিন ও পাসওয়ার্ড',
      archiveToLegacy: 'পুরনোটি লেগেসিতে রাখুন',
    },
    quickAddModal: {
      title: 'দ্রুত এন্ট্রি',
      saveEntry: 'এন্ট্রি সেভ করুন',
    },
    alerts: {
      title: 'WhatsApp QR ব্রিজ, অ্যালার্ট ও ব্যাকআপ',
      tabWhatsapp: 'WhatsApp QR ও নিয়ম',
      tabInbox: 'অ্যালার্ট লগ',
      tabBackup: 'ব্যাকআপ ও অটো-ওয়েকআপ',
      restoreTitle: 'সম্পূর্ণ ব্যাকআপ রিস্টোর (JSON)',
      restoreBtn: 'ব্যাকআপ রিস্টোর করুন',
    },
    commandPalette: {
      title: 'কমান্ড প্যালেট',
      placeholder: 'কমান্ড লিখুন, ওয়ার্কস্পেস খুঁজুন বা দ্রুত অ্যাকশন নিন...',
      quickActions: 'দ্রুত অ্যাকশন',
      workspaces: 'ওয়ার্কস্পেস',
      noResults: 'কোনো কমান্ড বা ওয়ার্কস্পেস পাওয়া যায়নি',
      shortcutHint: '↑↓ দিয়ে নেভিগেট করুন, বাছাই করতে Enter চাপুন, বন্ধ করতে Esc',
    },
  },
};

export function languageDisplayName(lang: AppLanguage): string {
  return LANGUAGE_META[lang].nativeLabel;
}
