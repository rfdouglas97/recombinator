/**
 * Canonical vertical ontology — sector → industry → workflow leaf.
 * Source seeds: YC sub-industries (41), NAICS/GICS-inspired industries, B2B workflow slices.
 */

export const SECTORS = [
  { id: 'ai-infrastructure', label: 'AI & Agent Infrastructure' },
  { id: 'enterprise-software', label: 'Enterprise Software & B2B Functions' },
  { id: 'financial-services', label: 'Financial Services & Insurance' },
  { id: 'healthcare-life-sciences', label: 'Healthcare & Life Sciences' },
  { id: 'industrials-defense', label: 'Industrials, Defense & Hard Tech' },
  { id: 'real-estate-construction', label: 'Real Estate & Construction' },
  { id: 'consumer', label: 'Consumer & Prosumer' },
  { id: 'retail-commerce', label: 'Retail & E-Commerce' },
  { id: 'transportation-logistics', label: 'Transportation & Logistics' },
  { id: 'energy-climate', label: 'Energy & Climate' },
  { id: 'media-entertainment', label: 'Media, Gaming & Entertainment' },
  { id: 'government-public', label: 'Government & Public Sector' },
  { id: 'agriculture', label: 'Agriculture & Food' },
  { id: 'education', label: 'Education & Workforce' },
  { id: 'professional-services', label: 'Professional Services & Research' },
];

export const INDUSTRIES = [
  // ai-infrastructure
  { id: 'ai-infrastructure.agent-platform', label: 'Agent platforms & runtime', sector_id: 'ai-infrastructure' },
  { id: 'ai-infrastructure.compute', label: 'AI compute & GPU infrastructure', sector_id: 'ai-infrastructure' },
  { id: 'ai-infrastructure.data', label: 'Agent context & training data', sector_id: 'ai-infrastructure' },
  { id: 'ai-infrastructure.voice-comms', label: 'Voice & agent communications', sector_id: 'ai-infrastructure' },
  // enterprise-software
  { id: 'enterprise.devtools', label: 'Developer tools', sector_id: 'enterprise-software' },
  { id: 'enterprise.it-ops', label: 'IT operations & service management', sector_id: 'enterprise-software' },
  { id: 'enterprise.security', label: 'Cybersecurity & compliance', sector_id: 'enterprise-software' },
  { id: 'enterprise.finance-ops', label: 'Finance & accounting operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.legal-ops', label: 'Legal operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.hr-ops', label: 'HR & talent operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.sales-gtm', label: 'Sales & revenue operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.marketing', label: 'Marketing operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.general-ops', label: 'Cross-functional business operations', sector_id: 'enterprise-software' },
  { id: 'enterprise.saas-platform', label: 'SaaS platform & extensibility', sector_id: 'enterprise-software' },
  // financial-services
  { id: 'fintech.payments', label: 'Payments', sector_id: 'financial-services' },
  { id: 'fintech.lending', label: 'Lending & credit', sector_id: 'financial-services' },
  { id: 'fintech.banking-cap-markets', label: 'Banking & capital markets', sector_id: 'financial-services' },
  { id: 'fintech.asset-wealth', label: 'Asset & wealth management', sector_id: 'financial-services' },
  { id: 'fintech.insurance', label: 'Insurance', sector_id: 'financial-services' },
  { id: 'fintech.prediction-markets', label: 'Prediction markets & event contracts', sector_id: 'financial-services' },
  // healthcare-life-sciences
  { id: 'healthcare.provider', label: 'Healthcare providers & services', sector_id: 'healthcare-life-sciences' },
  { id: 'healthcare.payer', label: 'Health insurance & payers', sector_id: 'healthcare-life-sciences' },
  { id: 'healthcare.pharma-biotech', label: 'Pharma & biotech R&D', sector_id: 'healthcare-life-sciences' },
  { id: 'healthcare.clinical-research', label: 'Clinical trials & CRO', sector_id: 'healthcare-life-sciences' },
  { id: 'healthcare.medtech', label: 'Medical devices & diagnostics', sector_id: 'healthcare-life-sciences' },
  { id: 'healthcare.digital-health', label: 'Digital health & wellness', sector_id: 'healthcare-life-sciences' },
  // industrials-defense
  { id: 'industrials.defense', label: 'Defense & national security', sector_id: 'industrials-defense' },
  { id: 'industrials.robotics', label: 'Robotics & automation', sector_id: 'industrials-defense' },
  { id: 'industrials.manufacturing', label: 'Manufacturing & industrial ops', sector_id: 'industrials-defense' },
  { id: 'industrials.aviation-space', label: 'Aviation & space', sector_id: 'industrials-defense' },
  // real-estate-construction
  { id: 'realestate.property', label: 'Property management & proptech', sector_id: 'real-estate-construction' },
  { id: 'realestate.construction', label: 'Construction & field services', sector_id: 'real-estate-construction' },
  // consumer
  { id: 'consumer.productivity', label: 'Personal productivity', sector_id: 'consumer' },
  { id: 'consumer.finance', label: 'Consumer finance', sector_id: 'consumer' },
  { id: 'consumer.career', label: 'Jobs & career', sector_id: 'consumer' },
  // retail-commerce
  { id: 'retail.merchant', label: 'Merchant & store operations', sector_id: 'retail-commerce' },
  { id: 'retail.ecommerce', label: 'E-commerce & DTC', sector_id: 'retail-commerce' },
  // transportation-logistics
  { id: 'logistics.supply-chain', label: 'Supply chain & procurement', sector_id: 'transportation-logistics' },
  { id: 'logistics.freight', label: 'Freight & logistics brokerage', sector_id: 'transportation-logistics' },
  // energy-climate
  { id: 'energy.power', label: 'Power generation & grid', sector_id: 'energy-climate' },
  { id: 'energy.climate', label: 'Climate & sustainability', sector_id: 'energy-climate' },
  // media-entertainment
  { id: 'media.gaming', label: 'Gaming & interactive', sector_id: 'media-entertainment' },
  { id: 'media.content', label: 'Content & creator economy', sector_id: 'media-entertainment' },
  // government-public
  { id: 'government.public-sector', label: 'Government & GovTech', sector_id: 'government-public' },
  // agriculture
  { id: 'agriculture.farming', label: 'Farming & ag operations', sector_id: 'agriculture' },
  // education
  { id: 'education.institutions', label: 'Schools & training providers', sector_id: 'education' },
  // professional-services
  { id: 'research.cap-markets', label: 'Capital markets research', sector_id: 'professional-services' },
  { id: 'research.market-intel', label: 'Market research & intelligence', sector_id: 'professional-services' },
  { id: 'services.consulting', label: 'Management & process consulting', sector_id: 'professional-services' },
];

/** @typedef {{ id: string, label: string, industry_id: string, workflow?: string, buyers?: string[], regulatory?: string[], aliases?: string[], yc_subindustry?: string[], naics_hint?: string[] }} VerticalLeaf */

/** @type {VerticalLeaf[]} */
export const VERTICALS = [
  // --- AI infrastructure ---
  { id: 'ai-infrastructure.agent-runtime', label: 'Agent runtime & orchestration', industry_id: 'ai-infrastructure.agent-platform', workflow: 'runtime', aliases: ['Agent runtime optimization', 'Agent runtime infrastructure', 'Agent infrastructure and deployment', 'Agent development infrastructure', 'Developer tools - agent frameworks'], yc_subindustry: ['B2B > Infrastructure', 'B2B > Engineering, Product and Design'] },
  { id: 'ai-infrastructure.agent-observability', label: 'Agent observability & logging', industry_id: 'ai-infrastructure.agent-platform', workflow: 'observability', aliases: ['Agent infrastructure / observability', 'Agent observability and evals'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'ai-infrastructure.agent-context-web', label: 'Agent web context & data enrichment', industry_id: 'ai-infrastructure.data', workflow: 'context_retrieval', aliases: ['Agent infrastructure / web data enrichment', 'Web data enrichment for agents'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'ai-infrastructure.agent-security', label: 'Agent security & authorization', industry_id: 'ai-infrastructure.agent-platform', workflow: 'security', aliases: ['AI agent security and authorization', 'Agent security'], yc_subindustry: ['B2B > Security'] },
  { id: 'ai-infrastructure.agent-telecom', label: 'Agent telecommunications infrastructure', industry_id: 'ai-infrastructure.voice-comms', workflow: 'telecom', aliases: ['Agent telecommunications infrastructure'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'ai-infrastructure.voice', label: 'Enterprise voice & speech infrastructure', industry_id: 'ai-infrastructure.voice-comms', workflow: 'voice', aliases: ['Enterprise voice infrastructure'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'ai-infrastructure.gpu-deploy', label: 'GPU infrastructure for model deployment', industry_id: 'ai-infrastructure.compute', workflow: 'gpu_serving', aliases: ['GPU infrastructure for AI model deployment', 'GPU/HPC infrastructure optimization'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'ai-infrastructure.training-data', label: 'Training & eval data generation', industry_id: 'ai-infrastructure.data', workflow: 'dataset_creation', aliases: ['Training data generation', 'Synthetic data for AI'], yc_subindustry: ['B2B > Analytics'] },
  { id: 'ai-infrastructure.medical-imaging', label: 'Medical imaging AI infrastructure', industry_id: 'ai-infrastructure.compute', workflow: 'medical_imaging', aliases: ['Medical imaging AI infrastructure'], yc_subindustry: ['B2B > Infrastructure', 'Healthcare > Healthcare IT'] },
  { id: 'ai-infrastructure.qa-testing', label: 'Software QA & test automation', industry_id: 'enterprise.devtools', workflow: 'qa', aliases: ['Software QA and testing automation'], yc_subindustry: ['B2B > Engineering, Product and Design'] },

  // --- Enterprise devtools & IT ---
  { id: 'enterprise.devtools.productivity', label: 'Developer productivity & engineering tools', industry_id: 'enterprise.devtools', workflow: 'dev_productivity', aliases: ['Developer tooling and engineering productivity', 'Developer productivity tools', 'DevOps incident management'], yc_subindustry: ['B2B > Engineering, Product and Design', 'B2B > Productivity'] },
  { id: 'enterprise.it.service-management', label: 'Enterprise IT service management', industry_id: 'enterprise.it-ops', workflow: 'itsm', aliases: ['Enterprise IT operations and service management', 'IT service desk'], yc_subindustry: ['B2B > Operations'] },
  { id: 'enterprise.it.cloud-infra', label: 'Cloud infrastructure & virtualization', industry_id: 'enterprise.it-ops', workflow: 'cloud', aliases: ['Cloud infrastructure & virtualization'], yc_subindustry: ['B2B > Infrastructure'] },
  { id: 'enterprise.security.appsec', label: 'Application & mobile security', industry_id: 'enterprise.security', workflow: 'appsec', aliases: ['Mobile application security', 'Application security'], yc_subindustry: ['B2B > Security'] },
  { id: 'enterprise.security.cyber', label: 'Enterprise cybersecurity operations', industry_id: 'enterprise.security', workflow: 'soc', aliases: ['Cybersecurity operations', 'Security monitoring'], yc_subindustry: ['B2B > Security'] },
  { id: 'enterprise.security.compliance-audit', label: 'Internal audit & SOX compliance', industry_id: 'enterprise.security', workflow: 'audit', aliases: ['Internal audit and SOX compliance', 'SOX compliance automation'], yc_subindustry: ['B2B > Finance and Accounting', 'B2B > Legal'] },
  { id: 'enterprise.ops.knowledge', label: 'Enterprise knowledge management', industry_id: 'enterprise.general-ops', workflow: 'knowledge', aliases: ['Enterprise knowledge management', 'Cross-functional team knowledge management', 'Team knowledge base'], yc_subindustry: ['B2B > Productivity'] },
  { id: 'enterprise.ops.process-automation', label: 'Cross-industry process automation', industry_id: 'enterprise.general-ops', workflow: 'process_automation', aliases: ['Enterprise process automation consulting', 'Cross-industry business operations automation', 'AI-native autonomous business operations'], yc_subindustry: ['B2B > Operations', 'B2B'] },
  { id: 'enterprise.ops.ai-transformation', label: 'Enterprise AI transformation consulting', industry_id: 'services.consulting', workflow: 'ai_consulting', aliases: ['Enterprise AI transformation consulting', 'Enterprise AI agent collaboration'], yc_subindustry: ['B2B > Operations'] },
  { id: 'enterprise.saas.extensibility', label: 'SaaS customization & extensibility', industry_id: 'enterprise.saas-platform', workflow: 'platform_ext', aliases: ['SaaS product customization and extensibility'], yc_subindustry: ['B2B > Engineering, Product and Design'] },

  // --- Finance ops ---
  { id: 'enterprise.finance.order-to-cash', label: 'Order-to-cash & billing operations', industry_id: 'enterprise.finance-ops', workflow: 'order_to_cash', aliases: ['Enterprise order-to-cash operations', 'Billing and invoicing operations'], yc_subindustry: ['B2B > Finance and Accounting'] },
  { id: 'enterprise.finance.accounting', label: 'Finance & accounting automation', industry_id: 'enterprise.finance-ops', workflow: 'accounting', aliases: ['Finance and accounting automation', 'Accounts payable automation'], yc_subindustry: ['B2B > Finance and Accounting'] },

  // --- Legal ---
  { id: 'enterprise.legal.contracts', label: 'Contract lifecycle & legal ops', industry_id: 'enterprise.legal-ops', workflow: 'contracts', aliases: ['Contract management', 'Legal operations automation'], yc_subindustry: ['B2B > Legal'] },
  { id: 'enterprise.legal.regulatory-consulting', label: 'Regulatory consulting (cross-industry)', industry_id: 'enterprise.legal-ops', workflow: 'regulatory', aliases: ['Regulatory consulting', 'Compliance consulting'], yc_subindustry: ['B2B > Legal'] },

  // --- HR ---
  { id: 'enterprise.hr.recruiting', label: 'Recruiting & staffing agency operations', industry_id: 'enterprise.hr-ops', workflow: 'recruiting', aliases: ['Staffing agency recruitment operations', 'Recruiting automation', 'Talent acquisition'], yc_subindustry: ['B2B > Recruiting and Talent', 'B2B > Human Resources'] },
  { id: 'enterprise.hr.workforce', label: 'HR & workforce management', industry_id: 'enterprise.hr-ops', workflow: 'hris', aliases: ['HR operations', 'Workforce management'], yc_subindustry: ['B2B > Human Resources'] },

  // --- Sales & marketing ---
  { id: 'enterprise.sales.enablement', label: 'Sales enablement & execution', industry_id: 'enterprise.sales-gtm', workflow: 'sales', aliases: ['Sales automation', 'Sales enablement'], yc_subindustry: ['B2B > Sales'] },
  { id: 'enterprise.marketing.growth', label: 'B2B growth marketing automation', industry_id: 'enterprise.marketing', workflow: 'growth', aliases: ['B2B growth marketing automation', 'B2B marketing operations and campaign execution', 'Marketing automation'], yc_subindustry: ['B2B > Marketing'] },
  { id: 'enterprise.marketing.devrel', label: 'Developer marketing & technical content', industry_id: 'enterprise.marketing', workflow: 'devrel', aliases: ['Developer marketing and technical content', 'DevRel content'], yc_subindustry: ['B2B > Marketing'] },
  { id: 'enterprise.marketing.analytics', label: 'Marketing analytics & market research', industry_id: 'research.market-intel', workflow: 'market_research', aliases: ['Market research and customer insights', 'Marketing analytics'], yc_subindustry: ['B2B > Analytics', 'B2B > Marketing'] },

  // --- Fintech ---
  { id: 'fintech.payments.consumer', label: 'Consumer payments & rewards', industry_id: 'fintech.payments', workflow: 'consumer_payments', aliases: ['Consumer payments and rewards optimization', 'Consumer payments'], yc_subindustry: ['Fintech > Payments', 'Fintech > Consumer Finance'] },
  { id: 'fintech.payments.b2b', label: 'B2B payments & treasury', industry_id: 'fintech.payments', workflow: 'b2b_payments', aliases: ['B2B payments', 'Treasury management'], yc_subindustry: ['Fintech > Payments', 'Fintech > Banking and Exchange'] },
  { id: 'fintech.lending.consumer', label: 'Consumer lending & credit', industry_id: 'fintech.lending', workflow: 'consumer_lending', aliases: ['Consumer credit', 'Personal lending'], yc_subindustry: ['Fintech > Credit and Lending', 'Fintech > Consumer Finance'] },
  { id: 'fintech.lending.business', label: 'Business lending & credit', industry_id: 'fintech.lending', workflow: 'business_lending', aliases: ['SMB lending', 'Commercial credit'], yc_subindustry: ['Fintech > Credit and Lending'] },
  { id: 'fintech.banking.exchange', label: 'Banking & exchange infrastructure', industry_id: 'fintech.banking-cap-markets', workflow: 'banking', aliases: ['Banking infrastructure', 'Exchange infrastructure'], yc_subindustry: ['Fintech > Banking and Exchange'] },
  {
    id: 'fintech.trading.derivatives',
    label: 'Trading & derivatives (general)',
    industry_id: 'fintech.banking-cap-markets',
    workflow: 'trading',
    aliases: ['Crypto-enabled equity derivatives trading', 'Equity derivatives trading', 'Crypto derivatives trading'],
    yc_subindustry: ['Fintech > Banking and Exchange', 'Fintech > Asset Management'],
  },

  // --- Prediction markets (dedicated category) ---
  {
    id: 'fintech.prediction-markets.infrastructure',
    label: 'Prediction markets data & institutional infrastructure',
    industry_id: 'fintech.prediction-markets',
    workflow: 'pm_data_infrastructure',
    buyers: ['Quant fund', 'Prop trading desk', 'Systematic trader', 'Institutional trader'],
    aliases: [
      'Institutional infrastructure for prediction markets',
      'Prediction markets data infrastructure',
      'Quantitative trading infrastructure for prediction markets',
      'Unified data layer for prediction markets',
      'Prediction market backtesting',
      'Cross-venue prediction market analytics',
      'Oddpool',
    ],
    yc_subindustry: ['Fintech > Banking and Exchange', 'Fintech > Asset Management', 'B2B > Analytics'],
  },
  {
    id: 'fintech.prediction-markets.execution',
    label: 'Prediction markets trading & prime brokerage',
    industry_id: 'fintech.prediction-markets',
    workflow: 'pm_execution',
    buyers: ['Professional trader', 'Trading firm', 'Market maker', 'Hedge fund'],
    aliases: [
      'Prime brokerage for prediction markets',
      'Prediction markets trading infrastructure',
      'Unified prediction markets trading platform',
      'Prediction markets prime brokerage',
      'Multi-venue prediction market execution',
      'Kalshi Polymarket trading',
      'Event contract trading',
      'River Markets',
      'Valence',
    ],
    yc_subindustry: ['Fintech > Banking and Exchange'],
  },
  {
    id: 'fintech.prediction-markets.belief-discovery',
    label: 'Prediction market belief-to-contract discovery',
    industry_id: 'fintech.prediction-markets',
    workflow: 'pm_belief_mapping',
    buyers: ['Forecaster', 'Trader', 'Investor', 'Operator'],
    aliases: [
      'Prediction market search',
      'Belief-to-contract mapping',
      'Prediction Finance',
      'Prediction market belief-to-contract mapping',
      'Kassandre Search',
      'ValCtrl',
    ],
    yc_subindustry: ['Fintech > Banking and Exchange', 'Fintech > Asset Management'],
  },
  {
    id: 'fintech.prediction-markets.derivatives-protocol',
    label: 'Prediction markets derivatives & protocol layer',
    industry_id: 'fintech.prediction-markets',
    workflow: 'pm_derivatives',
    buyers: ['DeFi trader', 'Liquidity provider', 'Prediction market platform', 'Protocol integrator'],
    aliases: [
      'Derivative layer for prediction markets',
      'Prediction markets DeFi derivatives',
      'Prediction markets derivatives infrastructure',
      'Alternative asset trading / prediction markets',
      'Attention trading exchange',
      'Event contract derivatives',
      'Totalis',
      'Forum',
    ],
    yc_subindustry: ['Fintech > Banking and Exchange'],
  },
  { id: 'fintech.wealth.asset-management', label: 'Asset & wealth management', industry_id: 'fintech.asset-wealth', workflow: 'wealth', aliases: ['Asset management', 'Wealth management technology'], yc_subindustry: ['Fintech > Asset Management'] },
  { id: 'fintech.insurance.corporate-risk', label: 'Corporate insurance & risk management', industry_id: 'fintech.insurance', workflow: 'corporate_risk', aliases: ['Corporate insurance risk management', 'Commercial insurance'], yc_subindustry: ['Fintech > Insurance'] },
  { id: 'fintech.insurance.agent-liability', label: 'AI & specialty liability insurance', industry_id: 'fintech.insurance', workflow: 'specialty_underwriting', aliases: ['AI agent liability insurance', 'Specialty liability insurance'], yc_subindustry: ['Fintech > Insurance'] },
  { id: 'fintech.insurance.claims-auto', label: 'Auto collision claims & subrogation', industry_id: 'fintech.insurance', workflow: 'claims', aliases: ['Auto body shop insurance claims recovery', 'Auto claims subrogation'], yc_subindustry: ['Fintech > Insurance', 'B2B > Operations'] },
  {
    id: 'fintech.insurance.claims-property',
    label: 'Property & casualty insurance claims & contents',
    industry_id: 'fintech.insurance',
    workflow: 'property_claims',
    aliases: [
      'Property insurance claims processing',
      'Property and casualty insurance claims',
      'Contents inventory insurance claims',
      'Public adjuster inventory automation',
      'Insurance contents inventory processing',
      'InventoryQuant',
    ],
    yc_subindustry: ['Fintech > Insurance', 'B2B > Operations'],
  },
  { id: 'fintech.insurance.underwriting', label: 'Insurance underwriting automation', industry_id: 'fintech.insurance', workflow: 'underwriting', aliases: ['Insurance underwriting', 'P&C underwriting automation'], yc_subindustry: ['Fintech > Insurance'] },

  // --- Healthcare ---
  { id: 'healthcare.provider.credentialing', label: 'Provider credentialing & payer enrollment', industry_id: 'healthcare.provider', workflow: 'credentialing', aliases: ['Healthcare credentialing and payer contracting', 'Provider enrollment', 'Payer contracting'], yc_subindustry: ['Healthcare > Healthcare Services', 'Healthcare > Healthcare IT'], regulatory: ['CMS', 'State licensing'] },
  { id: 'healthcare.provider.revenue-cycle', label: 'Healthcare revenue cycle management', industry_id: 'healthcare.provider', workflow: 'rcm', aliases: ['Healthcare revenue cycle', 'Medical billing RCM'], yc_subindustry: ['Healthcare > Healthcare IT', 'Healthcare > Healthcare Services'] },
  { id: 'healthcare.provider.patient-engagement', label: 'Patient engagement & adherence', industry_id: 'healthcare.provider', workflow: 'patient_engagement', aliases: ['Healthcare patient engagement and adherence', 'Patient adherence programs'], yc_subindustry: ['Healthcare > Healthcare Services', 'Healthcare'] },
  { id: 'healthcare.provider.specialty-practice', label: 'Specialty medical practice operations', industry_id: 'healthcare.provider', workflow: 'practice_ops', aliases: ['Specialty medical practice operations', 'Medical practice management'], yc_subindustry: ['Healthcare > Healthcare Services'] },
  { id: 'healthcare.pharma.clinical-dev', label: 'Biopharma clinical development & regulatory', industry_id: 'healthcare.pharma-biotech', workflow: 'clinical_dev', aliases: ['Biopharma clinical development and regulatory affairs', 'Clinical development regulatory'], yc_subindustry: ['Healthcare > Drug Discovery and Delivery', 'Healthcare > Therapeutics'] },
  { id: 'healthcare.pharma.drug-discovery', label: 'Drug discovery & delivery R&D', industry_id: 'healthcare.pharma-biotech', workflow: 'drug_discovery', aliases: ['Drug discovery', 'AI drug discovery'], yc_subindustry: ['Healthcare > Drug Discovery and Delivery'] },
  { id: 'healthcare.clinical.trials-data', label: 'Clinical trial data & biometrics', industry_id: 'healthcare.clinical-research', workflow: 'trial_data', aliases: ['Clinical trial data management and biometrics', 'Clinical trial biometrics and regulatory data management', 'CRO data management'], yc_subindustry: ['Healthcare > Healthcare IT', 'B2B > Analytics'] },
  { id: 'healthcare.regulatory.fda', label: 'FDA regulatory consulting (biotech & devices)', industry_id: 'healthcare.pharma-biotech', workflow: 'fda_regulatory', aliases: ['FDA regulatory consulting for biotech and medical devices', 'FDA regulatory affairs'], yc_subindustry: ['Healthcare > Healthcare Services', 'Healthcare > Medical Devices'] },
  { id: 'healthcare.medtech.devices', label: 'Medical devices & diagnostics', industry_id: 'healthcare.medtech', workflow: 'devices', aliases: ['Medical devices', 'Diagnostics platforms'], yc_subindustry: ['Healthcare > Medical Devices', 'Healthcare > Diagnostics'] },
  { id: 'healthcare.digital.consumer-wellness', label: 'Consumer digital health & wearables', industry_id: 'healthcare.digital-health', workflow: 'wellness', aliases: ['Consumer mental health wearables', 'Digital health consumer apps'], yc_subindustry: ['Healthcare > Consumer Health and Wellness', 'Consumer'] },
  { id: 'healthcare.digital.therapeutics', label: 'Digital therapeutics', industry_id: 'healthcare.digital-health', workflow: 'therapeutics', aliases: ['Digital therapeutics', 'Therapeutics software'], yc_subindustry: ['Healthcare > Therapeutics'] },

  // --- Industrials & defense ---
  { id: 'industrials.defense.supply-chain', label: 'Defense supply chain & prime contracting', industry_id: 'industrials.defense', workflow: 'defense_procurement', aliases: ['Defense supply chain and prime contracting', 'Defense prime contractor'], yc_subindustry: ['Industrials > Defense'] },
  { id: 'industrials.defense.drones', label: 'Defense drone & UAS operations', industry_id: 'industrials.defense', workflow: 'drones', aliases: ['Defense drone operations', 'Military UAS'], yc_subindustry: ['Industrials > Defense', 'Industrials > Drones'] },
  { id: 'industrials.defense.surveillance', label: 'Defense surveillance & threat detection', industry_id: 'industrials.defense', workflow: 'surveillance', aliases: ['Defense aerial threat detection', 'Defense surveillance and reconnaissance', 'Threat detection systems'], yc_subindustry: ['Industrials > Defense'] },
  { id: 'industrials.robotics.general', label: 'General-purpose robotics intelligence', industry_id: 'industrials.robotics', workflow: 'robotics_platform', aliases: ['General-purpose robotics intelligence', 'Robotics platform'], yc_subindustry: ['Industrials > Manufacturing and Robotics'] },
  { id: 'industrials.robotics.teleop', label: 'Robotics teleoperation infrastructure', industry_id: 'industrials.robotics', workflow: 'teleop', aliases: ['Robotics teleoperation infrastructure', 'Remote robot control'], yc_subindustry: ['Industrials > Manufacturing and Robotics'] },
  { id: 'industrials.manufacturing.ops', label: 'Manufacturing operations & order management', industry_id: 'industrials.manufacturing', workflow: 'mfg_ops', aliases: ['Manufacturing operations & order management', 'Manufacturing ERP automation'], yc_subindustry: ['Industrials > Manufacturing and Robotics', 'B2B > Operations'] },
  { id: 'industrials.manufacturing.automation', label: 'Manufacturing & logistics automation', industry_id: 'industrials.manufacturing', workflow: 'factory_automation', aliases: ['Manufacturing and logistics automation', 'Factory automation'], yc_subindustry: ['Industrials > Manufacturing and Robotics', 'B2B > Supply Chain and Logistics'] },
  { id: 'industrials.aviation.atc', label: 'Air traffic control & aviation systems', industry_id: 'industrials.aviation-space', workflow: 'atc', aliases: ['Air traffic control infrastructure', 'Aviation systems'], yc_subindustry: ['Industrials > Aviation and Space'] },
  { id: 'industrials.aviation.space', label: 'Space & satellite systems', industry_id: 'industrials.aviation-space', workflow: 'space', aliases: ['Satellite systems', 'Space infrastructure'], yc_subindustry: ['Industrials > Aviation and Space'] },
  { id: 'industrials.energy.smr', label: 'Small modular reactor & advanced nuclear', industry_id: 'energy.power', workflow: 'nuclear', aliases: ['Small modular reactor manufacturing', 'Advanced nuclear'], yc_subindustry: ['Industrials > Energy'] },

  // --- Real estate ---
  { id: 'realestate.property.management', label: 'Property management operations', industry_id: 'realestate.property', workflow: 'property_mgmt', aliases: ['Property management operations', 'Commercial real estate property management', 'Residential property management'], yc_subindustry: ['Real Estate and Construction > Housing and Real Estate', 'Real Estate and Construction'] },
  { id: 'realestate.construction.field', label: 'Construction field & project operations', industry_id: 'realestate.construction', workflow: 'construction_ops', aliases: ['Construction operations', 'Field service construction'], yc_subindustry: ['Real Estate and Construction > Construction'] },

  // --- Consumer ---
  { id: 'consumer.productivity.personal', label: 'Personal productivity software', industry_id: 'consumer.productivity', workflow: 'personal_productivity', aliases: ['Personal productivity software', 'Personal productivity apps'], yc_subindustry: ['Consumer', 'B2B > Productivity'] },
  { id: 'consumer.finance.personal', label: 'Personal finance management', industry_id: 'consumer.finance', workflow: 'pfm', aliases: ['Personal finance management', 'Personal budgeting apps'], yc_subindustry: ['Fintech > Consumer Finance', 'Consumer'] },
  { id: 'consumer.career.jobs', label: 'Job search & career services', industry_id: 'consumer.career', workflow: 'career', aliases: ['Job and career services', 'Career coaching platforms'], yc_subindustry: ['Consumer > Job and Career Services'] },

  // --- Retail & e-commerce ---
  { id: 'retail.merchant.ops', label: 'Retail store operations', industry_id: 'retail.merchant', workflow: 'store_ops', aliases: ['Retail store operations', 'In-store operations'], yc_subindustry: ['B2B > Retail', 'Consumer > Consumer Electronics'] },
  {
    id: 'retail.merchant.cpg',
    label: 'CPG brand operations & omnichannel retail',
    industry_id: 'retail.merchant',
    workflow: 'cpg_brand_ops',
    aliases: [
      'CPG brand operations',
      'Consumer packaged goods brand',
      'AI-native CPG brands',
      'Omnichannel CPG brand analytics',
      'Category management and supply chain for CPG',
      'Corvera',
    ],
    yc_subindustry: ['B2B > Retail', 'Consumer'],
  },
  { id: 'retail.ecommerce.conversion', label: 'E-commerce conversion optimization', industry_id: 'retail.ecommerce', workflow: 'conversion', aliases: ['E-commerce conversion optimization', 'E-commerce store operations and optimization', 'DTC optimization'], yc_subindustry: ['Consumer', 'B2B > Marketing'] },

  // --- Logistics ---
  {
    id: 'logistics.supply-chain.ops',
    label: 'Supply chain & procurement operations',
    industry_id: 'logistics.supply-chain',
    workflow: 'supply_chain',
    aliases: [
      'Supply chain operations',
      'Procurement automation',
      'Global logistics optimization',
      'Logistics optimization and supply chain orchestration',
      'WMS TMS logistics decision intelligence',
      'Haladir',
    ],
    yc_subindustry: ['B2B > Supply Chain and Logistics'],
  },
  { id: 'logistics.freight.brokerage', label: 'Freight brokerage & logistics', industry_id: 'logistics.freight', workflow: 'freight', aliases: ['Freight brokerage', 'Logistics coordination'], yc_subindustry: ['B2B > Supply Chain and Logistics'] },

  // --- Energy & climate ---
  { id: 'energy.power.grid', label: 'Power grid & energy infrastructure', industry_id: 'energy.power', workflow: 'grid', aliases: ['Power grid infrastructure', 'Energy infrastructure'], yc_subindustry: ['Industrials > Energy'] },
  { id: 'energy.climate.carbon', label: 'Climate & carbon management', industry_id: 'energy.climate', workflow: 'carbon', aliases: ['Climate tech', 'Carbon accounting'], yc_subindustry: ['Industrials > Climate'] },

  // --- Media & gaming ---
  { id: 'media.gaming.ugc', label: 'User-generated gaming platforms', industry_id: 'media.gaming', workflow: 'ugc_gaming', aliases: ['User-generated gaming platform', 'UGC gaming'], yc_subindustry: ['Consumer > Gaming', 'B2B > Gaming'] },
  { id: 'media.content.creator', label: 'Creator economy & AI content monetization', industry_id: 'media.content', workflow: 'creator', aliases: ['Creator economy / AI-generated content monetization', 'Creator monetization'], yc_subindustry: ['Consumer > Content'] },

  // --- Government ---
  { id: 'government.govtech.ops', label: 'Government operations & GovTech', industry_id: 'government.public-sector', workflow: 'gov_ops', aliases: ['GovTech', 'Government operations automation'], yc_subindustry: ['Government'] },

  // --- Agriculture ---
  { id: 'agriculture.farm.ops', label: 'Farm & ag operations', industry_id: 'agriculture.farming', workflow: 'farm_ops', aliases: ['Farm operations', 'Precision agriculture'], yc_subindustry: ['Industrials > Agriculture'] },

  // --- Education ---
  { id: 'education.institutional.learning', label: 'Institutional learning & EdTech', industry_id: 'education.institutions', workflow: 'learning', aliases: ['EdTech', 'Corporate training platforms'], yc_subindustry: ['B2B > Productivity'] },

  // --- Research & consulting ---
  { id: 'research.equity.hedge-funds', label: 'Hedge fund & equity research', industry_id: 'research.cap-markets', workflow: 'equity_research', aliases: ['Hedge fund equity research', 'Equity research terminals'], yc_subindustry: ['B2B > Finance and Accounting', 'B2B > Analytics'] },
  { id: 'research.ai-rd', label: 'AI research & development labs', industry_id: 'ai-infrastructure.agent-platform', workflow: 'ai_research', aliases: ['AI research and development'], yc_subindustry: ['B2B > Analytics'] },

  // --- Additional workflow slices (gap analysis coverage) ---
  { id: 'enterprise.support.customer', label: 'Customer support & contact center', industry_id: 'enterprise.general-ops', workflow: 'customer_support', aliases: ['Call center operations', 'Customer support automation', 'Customer success operations'], yc_subindustry: ['B2B > Operations'] },
  { id: 'enterprise.finance.payroll', label: 'Payroll & compensation operations', industry_id: 'enterprise.finance-ops', workflow: 'payroll', aliases: ['Payroll processing', 'Payroll automation'], yc_subindustry: ['B2B > Finance and Accounting', 'B2B > Human Resources'] },
  { id: 'enterprise.finance.tax', label: 'Tax preparation & compliance', industry_id: 'enterprise.finance-ops', workflow: 'tax', aliases: ['Tax compliance automation', 'Corporate tax operations'], yc_subindustry: ['B2B > Finance and Accounting'] },
  { id: 'enterprise.legal.immigration', label: 'Immigration & visa case management', industry_id: 'enterprise.legal-ops', workflow: 'immigration', aliases: ['Immigration case management'], yc_subindustry: ['B2B > Legal'] },
  { id: 'healthcare.dental.practice', label: 'Dental practice operations', industry_id: 'healthcare.provider', workflow: 'dental', aliases: ['Dental practice management'], yc_subindustry: ['Healthcare > Healthcare Services'] },
  { id: 'healthcare.home-health', label: 'Home health & post-acute care', industry_id: 'healthcare.provider', workflow: 'home_health', aliases: ['Home health operations', 'Post-acute care coordination'], yc_subindustry: ['Healthcare > Healthcare Services'] },
  { id: 'healthcare.pharmacy', label: 'Pharmacy & medication management', industry_id: 'healthcare.provider', workflow: 'pharmacy', aliases: ['Pharmacy operations', 'Medication adherence platforms'], yc_subindustry: ['Healthcare > Healthcare Services'] },
  { id: 'healthcare.payer.claims', label: 'Health payer claims & utilization', industry_id: 'healthcare.payer', workflow: 'payer_claims', aliases: ['Health insurance claims processing', 'Utilization management'], yc_subindustry: ['Healthcare > Healthcare IT', 'Fintech > Insurance'] },
  { id: 'fintech.insurance.life-annuity', label: 'Life & annuity insurance', industry_id: 'fintech.insurance', workflow: 'life_insurance', aliases: ['Life insurance operations', 'Annuity administration'], yc_subindustry: ['Fintech > Insurance'] },
  { id: 'hospitality.restaurant.ops', label: 'Restaurant & food service operations', industry_id: 'consumer.productivity', workflow: 'restaurant', aliases: ['Restaurant operations', 'Food service automation', 'Restaurant tech'], yc_subindustry: ['B2B > Operations'] },
  { id: 'hospitality.travel', label: 'Travel & hospitality operations', industry_id: 'consumer.productivity', workflow: 'travel', aliases: ['Hotel operations', 'Travel booking operations'], yc_subindustry: ['Consumer'] },
  { id: 'automotive.fleet', label: 'Fleet & automotive operations', industry_id: 'logistics.freight', workflow: 'fleet', aliases: ['Fleet management', 'Automotive dealership operations'], yc_subindustry: ['B2B > Operations'] },
  { id: 'realestate.hoa', label: 'HOA & community association management', industry_id: 'realestate.property', workflow: 'hoa', aliases: ['HOA management', 'Community association operations'], yc_subindustry: ['Real Estate and Construction > Housing and Real Estate'] },
  { id: 'realestate.architecture', label: 'Architecture & design services', industry_id: 'realestate.construction', workflow: 'architecture', aliases: ['Architecture services', 'AEC design automation'], yc_subindustry: ['B2B > Engineering, Product and Design'] },
  { id: 'professional.accounting-firms', label: 'Accounting & audit firm operations', industry_id: 'services.consulting', workflow: 'accounting_firm', aliases: ['CPA firm operations', 'Audit firm workflow'], yc_subindustry: ['B2B > Finance and Accounting'] },
  { id: 'professional.law-firms', label: 'Law firm operations & litigation', industry_id: 'enterprise.legal-ops', workflow: 'law_firm', aliases: ['Law firm case management', 'Litigation support'], yc_subindustry: ['B2B > Legal'] },
  { id: 'professional.nonprofit', label: 'Nonprofit & fundraising operations', industry_id: 'services.consulting', workflow: 'nonprofit', aliases: ['Nonprofit operations', 'Fundraising automation'], yc_subindustry: ['B2B > Operations'] },
  { id: 'consumer.fitness.wellness', label: 'Fitness & wellness consumer apps', industry_id: 'healthcare.digital-health', workflow: 'fitness', aliases: ['Fitness apps', 'Wellness coaching platforms'], yc_subindustry: ['Consumer', 'Healthcare > Consumer Health and Wellness'] },
  { id: 'industrials.semiconductor', label: 'Semiconductor manufacturing', industry_id: 'industrials.manufacturing', workflow: 'semiconductor', aliases: ['Semiconductor fab operations', 'Chip manufacturing'], yc_subindustry: ['Industrials > Manufacturing and Robotics'] },
  { id: 'industrials.utilities.water', label: 'Water & utility operations', industry_id: 'energy.power', workflow: 'utilities', aliases: ['Water utility operations', 'Municipal utility management'], yc_subindustry: ['Industrials > Energy', 'Government'] },
  { id: 'industrials.waste', label: 'Waste management & recycling', industry_id: 'industrials.manufacturing', workflow: 'waste', aliases: ['Waste management operations', 'Recycling logistics'], yc_subindustry: ['Industrials'] },
  { id: 'services.court-legal-support', label: 'Court reporting & legal support services', industry_id: 'enterprise.legal-ops', workflow: 'court_reporting', aliases: ['Court reporting', 'Legal support services'], yc_subindustry: ['B2B > Legal'] },
  { id: 'services.staffing.rpo', label: 'RPO & outsourced recruiting', industry_id: 'enterprise.hr-ops', workflow: 'rpo', aliases: ['Recruitment process outsourcing', 'RPO services'], yc_subindustry: ['B2B > Recruiting and Talent'] },
  { id: 'logistics.warehouse.fulfillment', label: 'Warehouse & fulfillment operations', industry_id: 'logistics.supply-chain', workflow: 'fulfillment', aliases: ['Warehouse management', '3PL fulfillment', 'E-commerce fulfillment'], yc_subindustry: ['B2B > Supply Chain and Logistics'] },
  { id: 'logistics.last-mile', label: 'Last-mile delivery operations', industry_id: 'logistics.freight', workflow: 'last_mile', aliases: ['Last-mile delivery', 'Local delivery logistics'], yc_subindustry: ['B2B > Supply Chain and Logistics'] },
  { id: 'education.corporate-training', label: 'Corporate training & L&D', industry_id: 'education.institutions', workflow: 'corporate_ld', aliases: ['Corporate learning', 'L&D platforms', 'Employee training'], yc_subindustry: ['B2B > Human Resources', 'B2B > Productivity'] },
];

/** Default vertical when only YC sub-industry pair is known (no agent label). */
export const YC_SUBINDUSTRY_DEFAULTS = {
  'B2B > Infrastructure': 'ai-infrastructure.agent-runtime',
  'B2B > Engineering, Product and Design': 'enterprise.devtools.productivity',
  'B2B > Operations': 'enterprise.ops.process-automation',
  'B2B > Productivity': 'enterprise.ops.knowledge',
  'B2B > Finance and Accounting': 'enterprise.finance.accounting',
  'B2B > Security': 'enterprise.security.cyber',
  'B2B > Marketing': 'enterprise.marketing.growth',
  'B2B > Legal': 'enterprise.legal.contracts',
  'B2B > Sales': 'enterprise.sales.enablement',
  'B2B > Analytics': 'enterprise.marketing.analytics',
  'B2B > Supply Chain and Logistics': 'logistics.supply-chain.ops',
  'B2B > Recruiting and Talent': 'enterprise.hr.recruiting',
  'B2B > Human Resources': 'enterprise.hr.workforce',
  'B2B > Retail': 'retail.merchant.ops',
  'B2B': 'enterprise.ops.process-automation',
  'Consumer': 'consumer.productivity.personal',
  'Consumer > Gaming': 'media.gaming.ugc',
  'Consumer > Content': 'media.content.creator',
  'Consumer > Consumer Electronics': 'retail.merchant.ops',
  'Consumer > Job and Career Services': 'consumer.career.jobs',
  'Fintech': 'fintech.payments.consumer',
  'Fintech > Insurance': 'fintech.insurance.corporate-risk',
  'Fintech > Payments': 'fintech.payments.b2b',
  'Fintech > Consumer Finance': 'consumer.finance.personal',
  'Fintech > Credit and Lending': 'fintech.lending.consumer',
  'Fintech > Banking and Exchange': 'fintech.banking.exchange',
  'Fintech > Asset Management': 'fintech.wealth.asset-management',
  'Healthcare': 'healthcare.provider.patient-engagement',
  'Healthcare > Healthcare IT': 'healthcare.provider.revenue-cycle',
  'Healthcare > Healthcare Services': 'healthcare.provider.specialty-practice',
  'Healthcare > Drug Discovery and Delivery': 'healthcare.pharma.drug-discovery',
  'Healthcare > Therapeutics': 'healthcare.digital.therapeutics',
  'Healthcare > Medical Devices': 'healthcare.medtech.devices',
  'Healthcare > Diagnostics': 'healthcare.medtech.devices',
  'Healthcare > Consumer Health and Wellness': 'healthcare.digital.consumer-wellness',
  'Healthcare > Industrial Bio': 'healthcare.pharma.drug-discovery',
  'Industrials': 'industrials.manufacturing.ops',
  'Industrials > Defense': 'industrials.defense.supply-chain',
  'Industrials > Manufacturing and Robotics': 'industrials.robotics.general',
  'Industrials > Drones': 'industrials.defense.drones',
  'Industrials > Aviation and Space': 'industrials.aviation.space',
  'Industrials > Energy': 'energy.power.grid',
  'Industrials > Climate': 'energy.climate.carbon',
  'Industrials > Agriculture': 'agriculture.farm.ops',
  'Real Estate and Construction': 'realestate.property.management',
  'Real Estate and Construction > Housing and Real Estate': 'realestate.property.management',
  'Real Estate and Construction > Construction': 'realestate.construction.field',
  'Government': 'government.govtech.ops',
};

/** Known YC batch companies → prediction-markets workflow leaf (slug is authoritative). */
export const PREDICTION_MARKET_SLUG_VERTICAL = {
  oddpool: 'fintech.prediction-markets.infrastructure',
  'river-markets': 'fintech.prediction-markets.execution',
  valence: 'fintech.prediction-markets.execution',
  'sequence-markets': 'fintech.prediction-markets.execution',
  valctrl: 'fintech.prediction-markets.belief-discovery',
  totalis: 'fintech.prediction-markets.derivatives-protocol',
  forum: 'fintech.prediction-markets.derivatives-protocol',
};

/** Reclassify pins that block alias matching for prediction-market companies. */
export const PREDICTION_MARKET_STALE_EXPLICIT_VERTICALS = new Set([
  'enterprise.devtools.productivity',
  'fintech.trading.derivatives',
  'marketing.competitive-intelligence',
  'consumer.finance.personal',
  'enterprise.ops.process-automation',
]);

/** Curated slug → vertical overrides (authoritative batch corrections). */
export const SLUG_VERTICAL_OVERRIDES = {
  ...PREDICTION_MARKET_SLUG_VERTICAL,
  haladir: 'logistics.supply-chain.ops',
  corvera: 'retail.merchant.cpg',
  inventoryquant: 'fintech.insurance.claims-property',
  // BM-01 × enterprise sense-check corrections (2026-06-04)
  elyra: 'hospitality.restaurant.ops',
  chasi: 'automotive.fleet',
  useparrot: 'fintech.insurance.claims-auto',
  withai: 'research.equity.hedge-funds',
  kinro: 'insurance.quote-comparison',
  pairio: 'robotics.maintenance-scheduling',
  zymbly: 'industrials.aviation.space',
  avoice: 'realestate.architecture',
  'klaus-ai': 'ai-infrastructure.agent-runtime',
  takecareos: 'healthcare.provider.telehealth-operations',
  tepali: 'healthcare.digital.consumer-wellness',
  hessian: 'enterprise.devtools.productivity',
  lab0: 'enterprise.devtools.productivity',
  mendral: 'enterprise.it.cloud-infra',
  'ressl-ai': 'realestate.construction.field',
  autositu: 'construction.permit-compliance',
};

/** Explicit verticals that should be re-inferred when text indicates a different domain. */
export const STALE_EXPLICIT_VERTICALS = new Set([
  ...PREDICTION_MARKET_STALE_EXPLICIT_VERTICALS,
  'healthcare.payer.claims',
]);
