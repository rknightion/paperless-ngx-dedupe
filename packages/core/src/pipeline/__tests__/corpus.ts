/**
 * Test corpus for pipeline E2E tests.
 * Generates ~200 documents across 7 groups with known duplicate relationships.
 */

export interface TestDocument {
  filename: string;
  groupKey: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Base texts — synthetic business/technical content
// ---------------------------------------------------------------------------

const BASE_TEXT_A = `Quarterly Financial Report for Acme Corporation prepared by the accounting department for the fiscal period ending March thirty first two thousand twenty four. Total revenue for the quarter was twelve million four hundred thousand dollars representing a fifteen percent increase over the same period last year. Operating expenses decreased by three percent to eight million seven hundred thousand dollars primarily due to improved supply chain efficiency and renegotiated vendor contracts. Net income for the quarter was three million seven hundred thousand dollars compared to two million nine hundred thousand in the prior year quarter. Cash and cash equivalents at quarter end totaled twenty one million dollars. Accounts receivable increased to four million two hundred thousand reflecting higher sales volume in the final month. Capital expenditures were one million three hundred thousand primarily for new manufacturing equipment and facility upgrades. The board of directors has declared a quarterly dividend of zero point thirty five per share payable to shareholders of record. Management expects continued growth in the coming quarters driven by new product launches and market expansion initiatives across the northeast and midwest regions.`;

const BASE_TEXT_B = `Technical Specification Document for Project Aurora version three point two. This document outlines the system architecture and requirements for the next generation data processing platform. The platform shall support ingestion of up to one million events per second with end to end latency not exceeding fifty milliseconds. The system consists of three primary components: an event collector layer, a stream processing engine, and a persistent storage backend. The event collector uses a distributed message queue supporting both push and pull delivery modes with configurable batching and compression. The stream processing engine implements a directed acyclic graph execution model with exactly once processing semantics and automatic checkpointing for fault tolerance. The storage backend utilizes a columnar format optimized for analytical queries with support for time based partitioning and automatic data lifecycle management. Authentication is handled via OAuth two point zero with support for SAML integration for enterprise customers. The system requires a minimum of sixteen CPU cores and sixty four gigabytes of RAM per processing node. Network bandwidth between nodes should be at least ten gigabits per second. Monitoring and alerting are provided through integration with standard observability platforms including metrics dashboards and distributed tracing.`;

const BASE_TEXT_C = `Standard Operating Procedure for Quality Assurance Testing in the Manufacturing Division. This procedure applies to all production lines and must be followed for every batch of finished goods before release to distribution. Step one involves visual inspection of packaging integrity checking for damage tears or improper sealing. Step two requires measurement of product dimensions using calibrated instruments to verify compliance with engineering tolerances of plus or minus zero point five millimeters. Step three is a weight verification test where each unit must fall within the acceptable range specified in the product data sheet. Step four involves electrical safety testing including insulation resistance and ground continuity measurements. Step five is a functional performance test where units are operated under standard conditions for a minimum of thirty minutes while monitoring key parameters. All test results must be recorded in the batch quality log and signed by the quality technician. Any unit failing any test must be segregated and tagged with a nonconformance report. Batch release requires a minimum pass rate of ninety eight point five percent across all tests. The quality manager must review and approve all batch documentation before goods are released for shipment.`;

const BASE_TEXT_D_MOBY = `Marine Biology Research Report on Cetacean Migration Patterns in the North Atlantic Basin. This comprehensive study analyzes tracking data collected over five years from satellite tagged humpback and fin whale populations. Migration routes were mapped using GPS coordinates recorded at four hour intervals revealing consistent seasonal patterns between feeding grounds in sub arctic waters and breeding areas in tropical latitudes. The data shows that humpback whales travel an average distance of five thousand two hundred nautical miles during their annual migration with individual variation of up to eight hundred nautical miles. Fin whales exhibited shorter migration routes averaging three thousand one hundred nautical miles. Both species demonstrated strong site fidelity returning to the same feeding and breeding areas across multiple years. Water temperature and prey availability were identified as the primary environmental factors influencing migration timing with departure from feeding grounds correlating strongly with sea surface temperature dropping below eight degrees celsius. The study recommends establishment of protected corridors along major migration routes to reduce collision risk with commercial shipping traffic.`;

const BASE_TEXT_D_PRIDE = `Annual Employee Satisfaction Survey Results for Greenfield Technologies Incorporated. The survey was conducted during the month of October and received responses from one thousand two hundred forty seven employees representing an eighty three percent participation rate across all departments. Overall job satisfaction scored seven point two out of ten representing a zero point four increase from the previous year. The highest rated categories were team collaboration at eight point one and workplace safety at eight point three. Areas identified for improvement include career development opportunities which scored five point nine and internal communication effectiveness at six point two. Compensation satisfaction varied significantly by department with engineering scoring seven point five and customer support scoring five point eight. Ninety one percent of respondents indicated they would recommend the company as a good place to work. Key themes from open ended responses included requests for more flexible work arrangements expanded professional development budgets and improved cafeteria food options. Management has committed to developing action plans for all categories scoring below seven point zero with quarterly progress updates to be shared with all staff members.`;

const BASE_TEXT_D_NINETEEN = `Urban Planning Assessment Report for the Downtown Revitalization Project Phase Two. This assessment evaluates the proposed mixed use development at the intersection of Main Street and Commerce Avenue. The project site encompasses approximately four point seven acres of currently underutilized commercial property including three vacant retail buildings and a surface parking lot. The proposed development includes two residential towers of eighteen and twenty two stories containing a combined four hundred sixty units with fifteen percent designated as affordable housing. Ground level retail space totaling forty two thousand square feet will accommodate local businesses and a public market hall. A central pedestrian plaza of approximately half an acre will provide green space and community gathering areas. Traffic impact analysis indicates the development will generate an additional two thousand three hundred vehicle trips per day. The transportation plan includes a new protected bicycle lane network parking structure with eight hundred spaces and enhanced bus service with two new stops. Environmental review confirms the site requires standard remediation for previous commercial use with estimated cleanup costs of one point two million dollars. The planning commission has scheduled public hearings for the first and third weeks of February.`;

// ---------------------------------------------------------------------------
// Text variation helpers
// ---------------------------------------------------------------------------

function addTypos(text: string, count: number): string {
  const words = text.split(' ');
  const step = Math.floor(words.length / (count + 1));
  for (let i = 0; i < count; i++) {
    const idx = step * (i + 1);
    if (idx < words.length && words[idx].length > 3) {
      const w = words[idx];
      words[idx] = w[0] + w[2] + w[1] + w.slice(3); // swap chars 1 and 2
    }
  }
  return words.join(' ');
}

function prependParagraph(text: string, paragraph: string): string {
  return `${paragraph} ${text}`;
}

function appendParagraph(text: string, paragraph: string): string {
  return `${text} ${paragraph}`;
}

function removeSentences(text: string, count: number): string {
  const sentences = text.split('. ');
  const step = Math.floor(sentences.length / (count + 1));
  const filtered = sentences.filter((_, i) => {
    for (let j = 0; j < count; j++) {
      if (i === step * (j + 1)) return false;
    }
    return true;
  });
  return filtered.join('. ');
}

function replaceSentences(text: string, replacements: string[]): string {
  const sentences = text.split('. ');
  const step = Math.floor(sentences.length / (replacements.length + 1));
  for (let i = 0; i < replacements.length; i++) {
    const idx = step * (i + 1);
    if (idx < sentences.length) {
      sentences[idx] = replacements[i];
    }
  }
  return sentences.join('. ');
}

// ---------------------------------------------------------------------------
// Unique document generation — 16 topic templates
// ---------------------------------------------------------------------------

const TOPIC_TEMPLATES: Array<{ topic: string; template: (i: number) => string }> = [
  {
    topic: 'cooking',
    template: (i) =>
      `Recipe number ${i} for seasonal vegetable stew. Preheat oven to ${325 + i} degrees fahrenheit. Dice ${2 + (i % 3)} medium potatoes and ${1 + (i % 2)} large carrots into half inch cubes. Saute ${i % 2 === 0 ? 'onions' : 'shallots'} in olive oil for ${4 + (i % 3)} minutes until translucent. Add vegetable broth and simmer for ${30 + i * 2} minutes. Season with ${i % 2 === 0 ? 'thyme and rosemary' : 'oregano and basil'}. Serves ${4 + (i % 4)} people. Preparation time is approximately ${45 + i * 3} minutes. This recipe works well with ${i % 2 === 0 ? 'crusty bread' : 'steamed rice'} as a side dish. Store leftovers in refrigerator for up to ${3 + (i % 3)} days.`,
  },
  {
    topic: 'astronomy',
    template: (i) =>
      `Observation log entry ${i} from the Cedar Ridge Observatory. Tonight we observed ${i % 2 === 0 ? 'Jupiter' : 'Saturn'} at ${20 + i} degrees elevation using the ${i % 2 === 0 ? 'twelve' : 'sixteen'} inch reflector telescope. Atmospheric seeing was rated ${5 + (i % 4)} out of ten. Cloud cover was approximately ${10 + i * 3} percent with intermittent high altitude cirrus. The ${i % 2 === 0 ? 'Great Red Spot' : 'ring system'} was clearly visible with exceptional detail at ${150 + i * 10}x magnification. Temperature at the dome was ${45 + i} degrees fahrenheit with humidity at ${30 + i * 2} percent. Integration time for imaging was ${60 + i * 5} seconds using the CCD camera. Processed ${20 + i * 4} frames for final stack.`,
  },
  {
    topic: 'gardening',
    template: (i) =>
      `Garden maintenance log week ${i}. Applied ${2 + (i % 3)} pounds of ${i % 2 === 0 ? 'organic compost' : 'balanced fertilizer'} to the ${i % 3 === 0 ? 'tomato' : i % 3 === 1 ? 'pepper' : 'squash'} beds. Soil pH measured at ${6.0 + (i % 5) * 0.2} which is ${i % 2 === 0 ? 'slightly acidic' : 'near neutral'} for this crop type. Watered with ${15 + i * 2} gallons distributed via drip irrigation over ${45 + i * 3} minutes. Noted ${i % 3} instances of aphid activity on lower leaves treated with neem oil solution. Harvested ${3 + i} pounds of ${i % 2 === 0 ? 'cherry tomatoes' : 'bell peppers'}. Transplanted ${4 + (i % 3)} seedlings from the greenhouse to raised bed number ${1 + (i % 6)}.`,
  },
  {
    topic: 'architecture',
    template: (i) =>
      `Building inspection report number ${1000 + i} for commercial property at ${100 + i * 10} Industrial Parkway. Structure type is ${i % 2 === 0 ? 'steel frame' : 'reinforced concrete'} construction built in ${1985 + i}. Total floor area is ${25000 + i * 1000} square feet across ${2 + (i % 3)} levels. Foundation inspection revealed ${i % 3 === 0 ? 'no visible defects' : 'minor surface cracking requiring monitoring'}. Roof condition rated ${7 + (i % 3)} out of ten with estimated remaining life of ${10 + i} years. HVAC system is a ${i % 2 === 0 ? 'central air' : 'split system'} unit installed ${3 + (i % 5)} years ago. Electrical panel capacity is ${400 + i * 50} amps with ${85 + (i % 10)} percent utilization. Fire suppression system last inspected ${1 + (i % 6)} months ago.`,
  },
  {
    topic: 'marine-biology',
    template: (i) =>
      `Field sampling report number ${i} from coastal monitoring station ${i % 2 === 0 ? 'Alpha' : 'Bravo'}. Water temperature measured at ${15.5 + i * 0.3} degrees celsius at ${3 + (i % 5)} meters depth. Salinity reading was ${33 + (i % 4)} parts per thousand. Dissolved oxygen concentration was ${7.2 + (i % 3) * 0.4} milligrams per liter. Collected ${12 + i * 2} plankton samples using ${i % 2 === 0 ? 'vertical net tow' : 'horizontal transect'} method. Identified ${8 + (i % 5)} distinct copepod species in preliminary analysis. Chlorophyll a concentration estimated at ${2.1 + i * 0.2} micrograms per liter indicating ${i % 2 === 0 ? 'moderate' : 'elevated'} primary productivity. Visibility measured at ${4 + (i % 3)} meters using secchi disk.`,
  },
  {
    topic: 'music',
    template: (i) =>
      `Concert program notes for performance number ${i} of the Metropolitan Chamber Orchestra. Tonight program features works in ${i % 2 === 0 ? 'D major' : 'B flat minor'}. The opening piece is a ${i % 2 === 0 ? 'overture' : 'sinfonietta'} lasting approximately ${12 + (i % 5)} minutes composed in ${1820 + i * 5}. The orchestra consists of ${45 + i} musicians including ${12 + (i % 4)} first violins and ${4 + (i % 3)} cellos. Guest soloist performs on ${i % 3 === 0 ? 'violin' : i % 3 === 1 ? 'piano' : 'clarinet'} in the featured concerto movement. Tempo markings range from adagio at ${56 + i} beats per minute to allegro vivace at ${144 + i * 2} beats per minute. Rehearsal time totaled ${18 + i} hours over ${4 + (i % 3)} sessions.`,
  },
  {
    topic: 'geology',
    template: (i) =>
      `Geological survey report for site ${2000 + i} in the ${i % 2 === 0 ? 'northern' : 'southern'} survey quadrant. Core sample extracted from depth of ${15 + i * 3} meters. Primary formation is ${i % 3 === 0 ? 'sandstone' : i % 3 === 1 ? 'limestone' : 'shale'} dating to the ${i % 2 === 0 ? 'Cretaceous' : 'Jurassic'} period approximately ${65 + i * 10} million years ago. Mineral composition analysis shows ${40 + (i % 20)} percent quartz ${20 + (i % 15)} percent feldspar and ${10 + (i % 10)} percent ite. Groundwater table detected at ${8 + i} meters below surface. Soil bearing capacity measured at ${2500 + i * 100} pounds per square foot suitable for ${i % 2 === 0 ? 'light commercial' : 'residential'} construction. Seismic risk classification is zone ${1 + (i % 3)}.`,
  },
  {
    topic: 'textiles',
    template: (i) =>
      `Production batch record number ${3000 + i} for ${i % 2 === 0 ? 'cotton blend' : 'polyester'} fabric manufacturing run. Loom speed set to ${200 + i * 5} picks per minute producing ${450 + i * 20} meters of fabric per shift. Thread count is ${180 + i * 4} per square inch in a ${i % 2 === 0 ? 'twill' : 'plain'} weave pattern. Fabric weight measured at ${150 + i * 3} grams per square meter. Color lot number ${i * 7} in ${i % 3 === 0 ? 'navy blue' : i % 3 === 1 ? 'charcoal grey' : 'forest green'} passed colorfast testing after ${5 + (i % 3)} wash cycles. Quality control rejected ${1 + (i % 4)} percent of output for ${i % 2 === 0 ? 'weaving defects' : 'dye inconsistency'}. Humidity in production area maintained at ${55 + (i % 10)} percent.`,
  },
  {
    topic: 'urban-planning',
    template: (i) =>
      `Traffic count survey report for intersection ${i} at ${i % 2 === 0 ? 'Oak Street' : 'Maple Avenue'} and ${i % 2 === 0 ? 'First Avenue' : 'Second Boulevard'}. Peak morning traffic volume was ${1200 + i * 50} vehicles per hour between seven and nine AM. Peak evening volume was ${1400 + i * 40} vehicles per hour between four thirty and six thirty PM. Pedestrian crossings averaged ${85 + i * 3} per hour during peak periods. Bicycle traffic counted at ${25 + i * 2} per hour. Average signal cycle time is ${90 + (i % 30)} seconds with ${35 + (i % 15)} seconds of green time for the major approach. Level of service rated ${i % 3 === 0 ? 'C' : i % 3 === 1 ? 'D' : 'B'} during peak hours. Recommended improvements include ${i % 2 === 0 ? 'dedicated turn lanes' : 'signal timing optimization'}.`,
  },
  {
    topic: 'cryptography',
    template: (i) =>
      `Security audit report number ${4000 + i} for ${i % 2 === 0 ? 'payment processing' : 'identity management'} system. Encryption algorithm is AES ${128 + (i % 3) * 64} with ${i % 2 === 0 ? 'GCM' : 'CBC'} mode of operation. Key rotation period is ${30 + i * 5} days with automated rotation via the key management service. TLS version ${i % 2 === 0 ? 'one point three' : 'one point two'} enforced for all external connections. Certificate validity period is ${365 + i * 30} days issued by ${i % 2 === 0 ? 'internal CA' : 'public CA'}. Password policy requires minimum ${10 + (i % 4)} characters with complexity rules. Multi factor authentication enabled for ${90 + (i % 10)} percent of user accounts. Penetration testing identified ${2 + (i % 5)} findings of ${i % 2 === 0 ? 'medium' : 'low'} severity. All findings have remediation plans with target completion within ${30 + i * 3} days.`,
  },
  {
    topic: 'beekeeping',
    template: (i) =>
      `Apiary inspection log for hive number ${i} conducted on ${i % 2 === 0 ? 'Tuesday' : 'Thursday'} of week ${1 + (i % 52)}. Colony population estimated at ${30000 + i * 1000} bees with ${i % 2 === 0 ? 'strong' : 'moderate'} brood pattern across ${6 + (i % 4)} frames. Queen ${i % 3 === 0 ? 'spotted and marked' : 'not spotted but eggs present'} confirming colony is queenright. Honey stores estimated at ${15 + i * 2} pounds in the ${2 + (i % 2)} supers. Varroa mite count was ${1 + (i % 8)} per hundred bees which is ${i % 2 === 0 ? 'below' : 'at'} treatment threshold. Added ${i % 2 === 0 ? 'sugar syrup' : 'pollen patty'} supplemental feed weighing ${2 + (i % 3)} pounds. Noted ${i % 3 === 0 ? 'normal foraging activity' : 'increased orientation flights indicating new brood emergence'}. Next inspection scheduled in ${7 + (i % 7)} days.`,
  },
  {
    topic: 'cartography',
    template: (i) =>
      `Map production log entry ${5000 + i} for the ${i % 2 === 0 ? 'topographic' : 'cadastral'} map series sheet ${i}. Scale is one to ${25000 + i * 5000} with contour interval of ${5 + (i % 4)} meters. Data sources include ${i % 2 === 0 ? 'aerial photography' : 'satellite imagery'} captured on date index ${100 + i} and ground survey points numbering ${50 + i * 3}. Horizontal accuracy verified to within ${0.5 + (i % 5) * 0.2} meters using ${12 + (i % 6)} control points. Vertical accuracy verified to within ${1.0 + (i % 4) * 0.3} meters. Feature classification includes ${200 + i * 10} buildings ${15 + i} road segments and ${8 + (i % 5)} water bodies. Projection is ${i % 2 === 0 ? 'UTM zone fourteen north' : 'state plane coordinate system'}. Digital file size is ${25 + i * 2} megabytes in GeoTIFF format.`,
  },
  {
    topic: 'glaciology',
    template: (i) =>
      `Glacier monitoring report for station ${6000 + i} on the ${i % 2 === 0 ? 'north' : 'south'} face of the study glacier. Ice thickness measured at ${120 + i * 5} meters using ground penetrating radar at frequency ${50 + i * 10} megahertz. Surface velocity measured at ${0.3 + i * 0.05} meters per day via GPS stake network of ${8 + (i % 4)} stations. Accumulation zone snow depth was ${3.5 + i * 0.2} meters water equivalent. Ablation zone melt rate averaged ${4.2 + i * 0.3} centimeters per day during the measurement period. Annual mass balance estimated at ${i % 2 === 0 ? 'negative' : 'slightly negative'} ${0.5 + i * 0.1} meters water equivalent. Terminus position retreated ${12 + i * 2} meters compared to previous year measurement. Supraglacial stream discharge measured at ${1.5 + i * 0.2} cubic meters per second.`,
  },
  {
    topic: 'numismatics',
    template: (i) =>
      `Coin collection inventory record ${7000 + i} for the ${i % 2 === 0 ? 'American' : 'European'} series. Item is a ${i % 3 === 0 ? 'silver dollar' : i % 3 === 1 ? 'gold sovereign' : 'copper penny'} dated ${1850 + i * 3} from the ${i % 2 === 0 ? 'Philadelphia' : 'Denver'} mint. Grade assessed as ${i % 3 === 0 ? 'very fine' : i % 3 === 1 ? 'extremely fine' : 'about uncirculated'} with a numeric grade of ${55 + (i % 15)}. Weight measured at ${8.0 + i * 0.5} grams with diameter of ${25 + (i % 10)} millimeters. ${i % 2 === 0 ? 'Obverse' : 'Reverse'} shows ${i % 2 === 0 ? 'minor contact marks' : 'light wear on high points'}. Estimated market value is ${200 + i * 75} dollars based on recent auction results. Provenance includes ${i % 2 === 0 ? 'estate sale acquisition' : 'dealer purchase'} in year ${2010 + (i % 14)}.`,
  },
  {
    topic: 'veterinary',
    template: (i) =>
      `Veterinary clinic patient record number ${8000 + i} for a ${2 + (i % 12)} year old ${i % 3 === 0 ? 'golden retriever' : i % 3 === 1 ? 'domestic shorthair cat' : 'labrador mix'} weighing ${i % 3 === 0 ? 30 + i : i % 3 === 1 ? 4 + i * 0.3 : 25 + i} ${i % 3 === 1 ? 'kilograms' : 'pounds'}. Presenting concern is ${i % 2 === 0 ? 'annual wellness examination' : 'decreased appetite for three days'}. Temperature ${i % 3 === 1 ? 38.5 + (i % 3) * 0.2 : 101.0 + (i % 3) * 0.3} degrees ${i % 3 === 1 ? 'celsius' : 'fahrenheit'}. Heart rate ${i % 3 === 1 ? 140 + i * 2 : 80 + i} beats per minute. Respiratory rate ${i % 3 === 1 ? 24 + (i % 8) : 16 + (i % 6)} breaths per minute. Vaccinations ${i % 2 === 0 ? 'updated including rabies and distemper combination' : 'current no updates needed'}. Recommended ${i % 2 === 0 ? 'dental cleaning' : 'blood panel'} at next visit in ${6 + (i % 6)} months.`,
  },
  {
    topic: 'logistics',
    template: (i) =>
      `Shipping manifest document ${9000 + i} for container ${i % 2 === 0 ? 'ABCU' : 'XYZU'}${100000 + i * 7}. Origin port is ${i % 3 === 0 ? 'Los Angeles' : i % 3 === 1 ? 'Rotterdam' : 'Shanghai'}. Destination port is ${i % 3 === 0 ? 'Tokyo' : i % 3 === 1 ? 'New York' : 'Sydney'}. Container type is ${i % 2 === 0 ? 'twenty foot standard' : 'forty foot high cube'}. Gross weight ${12000 + i * 200} kilograms. Number of packages ${45 + i * 3}. Commodity description is ${i % 2 === 0 ? 'electronic components' : 'automotive parts'} classified under harmonized code ${8471 + i * 10}. Estimated transit time ${14 + (i % 10)} days via ${i % 2 === 0 ? 'transpacific' : 'transatlantic'} route. Insurance value ${50000 + i * 2000} dollars. Bill of lading number ${i * 13 + 100000}. Customs clearance status ${i % 2 === 0 ? 'pending documentation review' : 'cleared for release'}.`,
  },
];

// ---------------------------------------------------------------------------
// Corpus builder
// ---------------------------------------------------------------------------

export function buildCorpus(): TestDocument[] {
  const docs: TestDocument[] = [];

  // --- Group A: Exact duplicates (5 copies of financial report) ---
  for (let i = 1; i <= 5; i++) {
    docs.push({
      filename: `financial-report-copy-${i}.pdf`,
      groupKey: 'group-a-exact',
      text: BASE_TEXT_A,
    });
  }

  // --- Group B: Near duplicates — minor variations of tech spec ---
  docs.push({
    filename: 'tech-spec-original.pdf',
    groupKey: 'group-b-near-minor',
    text: BASE_TEXT_B,
  });
  docs.push({
    filename: 'tech-spec-typos.pdf',
    groupKey: 'group-b-near-minor',
    text: addTypos(BASE_TEXT_B, 4),
  });
  docs.push({
    filename: 'tech-spec-reworded.pdf',
    groupKey: 'group-b-near-minor',
    text: replaceSentences(BASE_TEXT_B, [
      'The platform must handle up to one million events per second maintaining latency below fifty milliseconds',
      'Monitoring capabilities integrate with industry standard observability tools for metrics and tracing',
    ]),
  });
  docs.push({
    filename: 'tech-spec-with-intro.pdf',
    groupKey: 'group-b-near-minor',
    text: prependParagraph(
      BASE_TEXT_B,
      'Executive Summary: This document has been updated to reflect the latest architectural decisions made during the Q3 planning session.',
    ),
  });
  docs.push({
    filename: 'tech-spec-with-appendix.pdf',
    groupKey: 'group-b-near-minor',
    text: appendParagraph(
      BASE_TEXT_B,
      'Appendix A: For deployment instructions and configuration parameters please refer to the operations manual document number OPS-2024-047.',
    ),
  });
  docs.push({
    filename: 'tech-spec-shortened.pdf',
    groupKey: 'group-b-near-minor',
    text: removeSentences(BASE_TEXT_B, 3),
  });

  // --- Group C: Near duplicates — moderate variations of QA procedure ---
  docs.push({
    filename: 'qa-procedure-original.pdf',
    groupKey: 'group-c-near-moderate',
    text: BASE_TEXT_C,
  });
  docs.push({
    filename: 'qa-procedure-expanded.pdf',
    groupKey: 'group-c-near-moderate',
    text: appendParagraph(
      BASE_TEXT_C,
      'Additional requirements for export products: All units destined for international markets must undergo supplementary testing including voltage compatibility verification for the target market power standards. Documentation must include translated test certificates in the destination country official language. Export batch sizes are limited to five hundred units per shipment to facilitate customs inspection procedures.',
    ),
  });
  docs.push({
    filename: 'qa-procedure-condensed.pdf',
    groupKey: 'group-c-near-moderate',
    text: removeSentences(BASE_TEXT_C, 5),
  });
  docs.push({
    filename: 'qa-procedure-reworded.pdf',
    groupKey: 'group-c-near-moderate',
    text: replaceSentences(BASE_TEXT_C, [
      'The initial inspection step covers packaging condition assessment looking for any visible damage or compromised seals',
      'Functional testing requires operating each unit for no less than thirty minutes under controlled conditions',
      'A minimum acceptance rate of ninety eight point five percent is required before the batch can be approved for distribution',
    ]),
  });
  docs.push({
    filename: 'qa-procedure-with-header.pdf',
    groupKey: 'group-c-near-moderate',
    text: prependParagraph(
      addTypos(BASE_TEXT_C, 2),
      'Document Control: Revision twelve effective date January fifteenth two thousand twenty four. Approved by Director of Quality. Supersedes revision eleven dated September first two thousand twenty three.',
    ),
  });

  // --- Group D: Multi-cluster exact duplicates (3 texts x 4 copies) ---
  const groupDTexts = [
    { base: BASE_TEXT_D_MOBY, prefix: 'marine-research', subKey: 'group-d-marine' },
    { base: BASE_TEXT_D_PRIDE, prefix: 'employee-survey', subKey: 'group-d-survey' },
    { base: BASE_TEXT_D_NINETEEN, prefix: 'urban-planning', subKey: 'group-d-urban' },
  ];
  for (const { base, prefix, subKey } of groupDTexts) {
    for (let i = 1; i <= 4; i++) {
      docs.push({
        filename: `${prefix}-copy-${i}.pdf`,
        groupKey: subKey,
        text: base,
      });
    }
  }

  // --- Group E: Templated invoices with different details ---
  const invoiceDetails = [
    { num: '2024-001', company: 'Acme Corp', amount: '12500', date: 'January 15' },
    { num: '2024-002', company: 'Acme Corp', amount: '18750', date: 'February 20' },
    { num: '2024-003', company: 'Acme Corp', amount: '9300', date: 'March 10' },
    { num: '2024-004', company: 'Acme Corp', amount: '22100', date: 'April 5' },
  ];
  for (const inv of invoiceDetails) {
    docs.push({
      filename: `invoice-${inv.num}.pdf`,
      groupKey: 'group-e-template',
      text: `Invoice Number ${inv.num} from ${inv.company} dated ${inv.date} two thousand twenty four. Bill to: Greenfield Technologies Incorporated at 500 Commerce Drive Suite 200 Springfield. Total amount due: ${inv.amount} dollars. Payment terms: Net thirty days from date of invoice. Please remit payment via wire transfer to account number ending in 4872 at First National Bank routing number 021000089. Late payments are subject to a one point five percent monthly finance charge. All goods were shipped FOB origin via standard ground freight carrier. This invoice covers professional services rendered during the billing period including consulting fees project management and technical implementation support. Tax identification number 84-2937461. For billing inquiries please contact the accounts receivable department at extension 2400 or email billing at acmecorp dot com. Thank you for your continued business partnership.`,
    });
  }

  // --- Group F: 160 unique documents ---
  for (let i = 0; i < 160; i++) {
    const templateIdx = i % TOPIC_TEMPLATES.length;
    const { topic, template } = TOPIC_TEMPLATES[templateIdx];
    docs.push({
      filename: `unique-${topic}-${String(i).padStart(3, '0')}.pdf`,
      groupKey: `unique-${i}`,
      text: template(i),
    });
  }

  // --- Group G: Edge cases ---
  const edgeCaseText =
    'Standard maintenance checklist for quarterly equipment inspection of the central HVAC system. Verify thermostat calibration and sensor readings. Check refrigerant levels and pressure gauges. Inspect air filters and replace if dirty. Test emergency shutoff switches and safety interlocks. Clean condenser coils and drain pans. Lubricate fan bearings and belt tension. Record all readings in the maintenance log.';

  // G1-G2: Case insensitive pair
  docs.push({
    filename: 'edge-case-normal.pdf',
    groupKey: 'group-g-case',
    text: edgeCaseText,
  });
  docs.push({
    filename: 'edge-case-uppercase.pdf',
    groupKey: 'group-g-case',
    text: edgeCaseText.toUpperCase(),
  });

  // G3-G4: Whitespace variation pair
  docs.push({
    filename: 'edge-whitespace-normal.pdf',
    groupKey: 'group-g-whitespace',
    text: edgeCaseText,
  });
  docs.push({
    filename: 'edge-whitespace-extra.pdf',
    groupKey: 'group-g-whitespace',
    text: edgeCaseText.replace(/ /g, '   ').replace(/\./g, ' .  '),
  });

  // G5-G6: Minimal length pair (just above minWords=20 threshold)
  const minLengthText =
    'The quick brown fox jumps over the lazy dog near the old stone bridge by the river bank every single morning without exception';
  docs.push({
    filename: 'edge-minlength-a.pdf',
    groupKey: 'group-g-minlength',
    text: minLengthText,
  });
  docs.push({
    filename: 'edge-minlength-b.pdf',
    groupKey: 'group-g-minlength',
    text: minLengthText,
  });

  // G7: Below threshold (19 words — should NOT be analyzed)
  docs.push({
    filename: 'edge-below-threshold.pdf',
    groupKey: 'group-g-below-threshold',
    text: 'This short document has fewer than twenty words and should be skipped by the analysis engine entirely',
  });

  // G8-G9: Partial overlap (~50% shared content)
  docs.push({
    filename: 'edge-partial-a.pdf',
    groupKey: 'group-g-partial-a',
    text: `${edgeCaseText} Additionally the electrical panel was inspected for loose connections and arc damage. All circuit breakers were tested for proper trip settings. Emergency lighting battery backup tested with successful two hour runtime. Fire alarm pull stations verified operational at all exits.`,
  });
  docs.push({
    filename: 'edge-partial-b.pdf',
    groupKey: 'group-g-partial-b',
    text: `${edgeCaseText} The plumbing system was also evaluated including water pressure testing at all fixtures. Hot water heater temperature verified at one hundred twenty degrees. Backflow prevention devices tested and certified. Storm drain grates cleared of debris and inspected for structural integrity.`,
  });

  return docs;
}
