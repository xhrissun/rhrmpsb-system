import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// TOC Index — parsed from TABLE_CONTENTS.pdf (513 entries)
// This is the ground truth for code → name → page → office mapping
// ─────────────────────────────────────────────────────────────────────────────

const TOC_INDEX = [{"code":"SCI4","name":"Managing Corporate Identity and Brand","page":22,"office":"Central Office"},{"code":"SCI5","name":"Managing Media Relations","page":23,"office":"Central Office"},{"code":"SCI7","name":"Managing Library and Information Resources to","page":28,"office":"Central Office"},{"code":"SCI8","name":"Developing Partnerships to Support Priority Projects and Programs","page":30,"office":"Central Office"},{"code":"SCI9","name":"Managing Events","page":31,"office":"Central Office"},{"code":"SCI10","name":"Managing Issues","page":32,"office":"Central Office"},{"code":"SCI11","name":"Managing Stakeholder Relations","page":33,"office":"Central Office"},{"code":"SCI12","name":"Adhering to Ethical Standards and Practices in SCIS Activities","page":35,"office":"Central Office"},{"code":"LA1","name":"Skills in Legal Research","page":36,"office":"Central Office"},{"code":"LA2","name":"Management and Disposition of ENR Appealed Cases and other Legal Concerns","page":38,"office":"Central Office"},{"code":"LA3","name":"Litigation","page":40,"office":"Central Office"},{"code":"LA4","name":"Legal Counseling and Alternative Dispute Resolution","page":41,"office":"Central Office"},{"code":"LA5","name":"Investigation and Disposition of Administrative Complaints","page":42,"office":"Central Office"},{"code":"S1","name":"Legal Note Taking","page":43,"office":"Central Office"},{"code":"S2","name":"Legal Records Management","page":44,"office":"Central Office"},{"code":"S3","name":"Computerized Records Management","page":46,"office":"Central Office"},{"code":"S4","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":47,"office":"Central Office"},{"code":"AS1","name":"Procurement Management","page":49,"office":"Central Office"},{"code":"AS2","name":"Property Management (Property Inventory and Disposal Management)","page":51,"office":"Central Office"},{"code":"AS3","name":"Records Management","page":53,"office":"Central Office"},{"code":"AS4","name":"Computerized Records Management","page":54,"office":"Central Office"},{"code":"AS5","name":"Courier, Postal and Messengerial Services","page":55,"office":"Central Office"},{"code":"AS6","name":"Clerical/ Secretarial/ Messengerial Services","page":56,"office":"Central Office"},{"code":"AS7","name":"Building Maintenance System Administration","page":58,"office":"Central Office"},{"code":"AS8","name":"Repair and Fabrication","page":59,"office":"Central Office"},{"code":"AS9","name":"Gardening and Landscaping","page":60,"office":"Central Office"},{"code":"AS10","name":"Radio Telecommunications Services","page":61,"office":"Central Office"},{"code":"AS11","name":"Motorpool Services Management","page":62,"office":"Central Office"},{"code":"AS12","name":"Vehicle Repair and Maintenance","page":63,"office":"Central Office"},{"code":"AS13","name":"Cash Management","page":64,"office":"Central Office"},{"code":"AS14","name":"Hostel Administration","page":65,"office":"Central Office"},{"code":"AS15","name":"Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management","page":66,"office":"Central Office"},{"code":"AS16","name":"Customer Assistance and Request Handling","page":67,"office":"Central Office"},{"code":"HR1","name":"Recruitment, Selection, and Placement","page":68,"office":"Central Office"},{"code":"HR2","name":"Compensation, Benefits, and Welfare Administration","page":70,"office":"Central Office"},{"code":"HR3","name":"Processing of Personnel Actions","page":72,"office":"Central Office"},{"code":"HR4","name":"Grievance Handling","page":73,"office":"Central Office"},{"code":"HR5","name":"Employee Counseling and Coaching","page":74,"office":"Central Office"},{"code":"HR6","name":"Learning Needs Assessment (LNA)","page":75,"office":"Central Office"},{"code":"HR7","name":"Preparation of Learning Design","page":76,"office":"Central Office"},{"code":"HR8","name":"Learning Program Management","page":77,"office":"Central Office"},{"code":"HR9","name":"Learning Event Facilitation","page":78,"office":"Central Office"},{"code":"HR10","name":"Networking and Linkaging with HR Partners","page":79,"office":"Central Office"},{"code":"HR11","name":"Monitoring and Evaluation (M&E) of L&D Programs","page":80,"office":"Central Office"},{"code":"HR12","name":"Competency Development and Enhancement","page":81,"office":"Central Office"},{"code":"HR13","name":"Scholarship Administration","page":82,"office":"Central Office"},{"code":"HR14","name":"HR Planning","page":84,"office":"Central Office"},{"code":"HR15","name":"Career Development","page":86,"office":"Central Office"},{"code":"HR16","name":"Organization Development","page":88,"office":"Central Office"},{"code":"IA1","name":"Management Audit","page":89,"office":"Central Office"},{"code":"IA2","name":"Operations Audit","page":91,"office":"Central Office"},{"code":"FM1","name":"General Accounting","page":93,"office":"Central Office"},{"code":"FM2","name":"Budget Preparation and Legislation","page":96,"office":"Central Office"},{"code":"FM3","name":"Budget Execution and Accountability","page":98,"office":"Central Office"},{"code":"FM4","name":"Organization and Management Systems Improvement","page":100,"office":"Central Office"},{"code":"IS1","name":"Application Systems Development","page":102,"office":"Central Office"},{"code":"IS2","name":"Systems Analysis and Design","page":103,"office":"Central Office"},{"code":"IS3","name":"Network Infrastructure Management","page":105,"office":"Central Office"},{"code":"IS4","name":"Network Systems Management","page":106,"office":"Central Office"},{"code":"IS5","name":"Information and Communication Technologies (ICT) Planning and Resource Management","page":107,"office":"Central Office"},{"code":"IS6","name":"Cyber Security and Information Security","page":109,"office":"Central Office"},{"code":"IS7","name":"Data Management and Publication of Knowledge Products","page":110,"office":"Central Office"},{"code":"IS8","name":"Statistical Analysis and Production of Knowledge Products","page":112,"office":"Central Office"},{"code":"IS9","name":"Spatial Analysis, Conversion of Statistical Data to Spatial Data, and Conversion to Knowledge Products","page":113,"office":"Central Office"},{"code":"PP1","name":"Planning and Programming","page":115,"office":"Central Office"},{"code":"PP2","name":"Policy Analysis","page":117,"office":"Central Office"},{"code":"PP3","name":"Monitoring and Evaluation of DENR Programs and Projects","page":118,"office":"Central Office"},{"code":"FASP1","name":"Project Preparation and Design","page":120,"office":"Central Office"},{"code":"FASP2","name":"Fund Sourcing and Resource Mobilization","page":122,"office":"Central Office"},{"code":"FASP3","name":"Project Operations Planning","page":124,"office":"Central Office"},{"code":"FASP4","name":"Project Coordination, Facilitation, Progress Monitoring of Project Implementation","page":126,"office":"Central Office"},{"code":"FASP5","name":"Project Monitoring and Evaluation","page":128,"office":"Central Office"},{"code":"FASP6","name":"Project Financial and Administrative Management","page":130,"office":"Central Office"},{"code":"EE1","name":"Policy Research and Development on Ecological Solid Waste Management (ESWM)","page":133,"office":"Central Office"},{"code":"EE2","name":"Training and Information Dissemination on Ecological Solid Waste Management","page":134,"office":"Central Office"},{"code":"EE3","name":"Implementation of Programs and Projects on Ecological Solid Waste Management (ESWM)","page":135,"office":"Central Office"},{"code":"EE4","name":"Solid Waste Monitoring and Assessment","page":136,"office":"Central Office"},{"code":"WQWM1","name":"Water Quality Management","page":137,"office":"Central Office"},{"code":"WQWM2","name":"Monitoring and Evaluation of Compliance of Facilities or Establishments","page":138,"office":"Central Office"},{"code":"WQWM3","name":"Environmental Research Generation","page":139,"office":"Central Office"},{"code":"WQWM4","name":"Collection of Water Samples","page":140,"office":"Central Office"},{"code":"WQWM5","name":"Collection of Environmental Data","page":141,"office":"Central Office"},{"code":"WQWM6","name":"Data Analysis and Interpretation","page":142,"office":"Central Office"},{"code":"WQWM7","name":"Documentation and Dissemination of Results","page":143,"office":"Central Office"},{"code":"WQWM8","name":"Equipment Maintenance and Calibration","page":144,"office":"Central Office"},{"code":"EP1","name":"Environmental Planning, Programming and Evaluation","page":145,"office":"Central Office"},{"code":"EP2","name":"Project Monitoring","page":147,"office":"Central Office"},{"code":"RSCI1","name":"Media Relations Management","page":153,"office":"Regional Offices"},{"code":"RSCI2","name":"Development Communication Management","page":155,"office":"Regional Offices"},{"code":"RSCI3","name":"Event Management","page":157,"office":"Regional Offices"},{"code":"RSCI4","name":"Visual Communication (Graphic Design and Layout)","page":159,"office":"Regional Offices"},{"code":"RSCI5","name":"Video Production","page":161,"office":"Regional Offices"},{"code":"RSCI6","name":"Photojournalism","page":163,"office":"Regional Offices"},{"code":"RSCI7","name":"Library Management","page":165,"office":"Regional Offices"},{"code":"RP1","name":"Planning and Programming","page":167,"office":"Regional Offices"},{"code":"RP2","name":"Monitoring and Evaluation","page":169,"office":"Regional Offices"},{"code":"RP3","name":"Statistical Analysis, Data Management and Production of Knowledge Products","page":171,"office":"Regional Offices"},{"code":"RP4","name":"Organization and Management Systems Improvement","page":173,"office":"Regional Offices"},{"code":"RIS1","name":"Statistical Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products","page":175,"office":"Regional Offices"},{"code":"RIS2","name":"Software Development","page":177,"office":"Regional Offices"},{"code":"RIS3","name":"Network Infrastructure Management","page":178,"office":"Regional Offices"},{"code":"RIS4","name":"Systems Analysis and Design","page":179,"office":"Regional Offices"},{"code":"RIS5","name":"Web Development","page":181,"office":"Regional Offices"},{"code":"RIS6","name":"Information and Communication Technologies (ICT) Resource Management","page":183,"office":"Regional Offices"},{"code":"RIS7","name":"Cyber Security and Information Security","page":184,"office":"Regional Offices"},{"code":"RFM1","name":"General Accounting","page":185,"office":"Regional Offices"},{"code":"RFM2","name":"Budget Preparation","page":187,"office":"Regional Offices"},{"code":"RFM3","name":"Budget Administration and Control","page":188,"office":"Regional Offices"},{"code":"RFM4","name":"Organization and Management Systems Improvement","page":190,"office":"Regional Offices"},{"code":"RFM5","name":"Cash Management","page":192,"office":"Regional Offices"},{"code":"RLA1","name":"Skills in Legal Research","page":193,"office":"Regional Offices"},{"code":"RLA2","name":"Management and Disposition of ENR Cases and Other Legal Concerns","page":195,"office":"Regional Offices"},{"code":"RLA3","name":"Litigation","page":197,"office":"Regional Offices"},{"code":"RLA4","name":"Legal Counseling and Alternate Dispute Resolution (ADR)","page":198,"office":"Regional Offices"},{"code":"RLA5","name":"Investigation and Disposition of Administrative Complaints","page":199,"office":"Regional Offices"},{"code":"RS1","name":"Legal Note Taking","page":200,"office":"Regional Offices"},{"code":"RS2","name":"Legal Records Management","page":201,"office":"Regional Offices"},{"code":"RS3","name":"Computerized Records Management","page":203,"office":"Regional Offices"},{"code":"RS4","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":204,"office":"Regional Offices"},{"code":"RAS1","name":"Procurement Management","page":206,"office":"Regional Offices"},{"code":"RAS2","name":"Property Management (Property Inventory and Disposal Management)","page":208,"office":"Regional Offices"},{"code":"RAS3","name":"Records Management","page":209,"office":"Regional Offices"},{"code":"RAS4","name":"Computerized Records Management","page":210,"office":"Regional Offices"},{"code":"RAS5","name":"Courier, Postal and Messengerial Services","page":211,"office":"Regional Offices"},{"code":"RAS6","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":212,"office":"Regional Offices"},{"code":"RAS7","name":"Building Maintenance System Administration","page":214,"office":"Regional Offices"},{"code":"RAS8","name":"Repair and Fabrication","page":215,"office":"Regional Offices"},{"code":"RAS9","name":"Driving","page":217,"office":"Regional Offices"},{"code":"RAS10","name":"Vehicle Repair and Maintenance","page":219,"office":"Regional Offices"},{"code":"RAS11","name":"Motor Pool Services Management","page":220,"office":"Regional Offices"},{"code":"RHR1","name":"Recruitment, Selection and Placement","page":222,"office":"Regional Offices"},{"code":"RHR2","name":"Compensation, Benefits and Welfare Administration","page":224,"office":"Regional Offices"},{"code":"RHR3","name":"Processing of Personnel Actions","page":226,"office":"Regional Offices"},{"code":"RHR4","name":"Grievance Handling","page":227,"office":"Regional Offices"},{"code":"RHR5","name":"Performance Management","page":228,"office":"Regional Offices"},{"code":"RHR6","name":"Learning Needs Assessment (LNA)","page":229,"office":"Regional Offices"},{"code":"RHR7","name":"Preparation of Learning Design","page":230,"office":"Regional Offices"},{"code":"RHR8","name":"Learning Event Management","page":231,"office":"Regional Offices"},{"code":"RHR9","name":"Learning Event Facilitation","page":232,"office":"Regional Offices"},{"code":"RHR10","name":"Network and Linkaging with HR Partners","page":234,"office":"Regional Offices"},{"code":"RHR11","name":"Monitoring and Evaluation (M&E) of Learning and Development (L&D) Program","page":235,"office":"Regional Offices"},{"code":"RHR12","name":"Scholarship Administration","page":236,"office":"Regional Offices"},{"code":"RHR13","name":"HR Planning","page":238,"office":"Regional Offices"},{"code":"RHR14","name":"Career Development","page":240,"office":"Regional Offices"},{"code":"RO1","name":"Concept and Application of Integrated Ecosystems Management (IEM)","page":242,"office":"Regional Offices"},{"code":"RO2","name":"Identification of Interventions and Integrating Strategies Across Sectors (Forestry, Coastal, Agriculture, Urban, Air Space) and Zoning for Strategic Management","page":243,"office":"Regional Offices"},{"code":"RO3","name":"Characterization of Ecosystem and Use of Planning Tools and Procedures","page":244,"office":"Regional Offices"},{"code":"RO4","name":"Resource Management and Restoration/ Rehabilitation of Degraded Ecosystems","page":245,"office":"Regional Offices"},{"code":"RO5","name":"Preparation of Natural Resources Management (NRM) - Related Plans FLUP, CRMP, ISWMP, PAMP, IRBM, IWRM","page":246,"office":"Regional Offices"},{"code":"RO6","name":"Environment and Natural Resource Accounting (ENRA)","page":247,"office":"Regional Offices"},{"code":"RO7","name":"Strategies and Schemes for Financing Environmental Projects","page":248,"office":"Regional Offices"},{"code":"RO8","name":"Results-Based Monitoring and Evaluation Systems (RBME) and Environmental Audit for Different ENRM Sites","page":249,"office":"Regional Offices"},{"code":"RO9","name":"Environmental Governance","page":251,"office":"Regional Offices"},{"code":"RO10","name":"Climate Change and Environmental Management","page":252,"office":"Regional Offices"},{"code":"RO11","name":"Information, Education and Communication, Social Marketing and Extension Support","page":253,"office":"Regional Offices"},{"code":"RO12","name":"Impact Assessment Across Ecosystems","page":254,"office":"Regional Offices"},{"code":"RO13","name":"Social Negotiation","page":255,"office":"Regional Offices"},{"code":"RO14","name":"ENR Law Enforcement","page":256,"office":"Regional Offices"},{"code":"RO15","name":"Geographic Information System (GIS)","page":258,"office":"Regional Offices"},{"code":"RO16","name":"Surveying","page":259,"office":"Regional Offices"},{"code":"RO17","name":"Survey Verification","page":261,"office":"Regional Offices"},{"code":"RO18","name":"Mapping","page":262,"office":"Regional Offices"},{"code":"RO19","name":"Land Management Information System Administration","page":264,"office":"Regional Offices"},{"code":"RO20","name":"Land Records Management","page":265,"office":"Regional Offices"},{"code":"RO21","name":"Land Disposition and Management","page":267,"office":"Regional Offices"},{"code":"RO22","name":"Forest, Water, and Wildlife Resource Regulation","page":268,"office":"Regional Offices"},{"code":"RO23","name":"Tenure and Rights Assessment","page":269,"office":"Regional Offices"},{"code":"RO24","name":"Tenurial Instruments and Permits for Improved Resource Management","page":270,"office":"Regional Offices"},{"code":"PO1","name":"Protected Area Management","page":271,"office":"Regional Offices"},{"code":"PO2","name":"Management of Socio-Economics and Cultural Concerns","page":272,"office":"Regional Offices"},{"code":"PO3","name":"Conservation and Management of Wildlife Species and their Habitats","page":273,"office":"Regional Offices"},{"code":"PO4","name":"Ecotourism Development and Management","page":276,"office":"Regional Offices"},{"code":"PO5","name":"Natural Resources Assessment - Biological & Physical","page":278,"office":"Regional Offices"},{"code":"PO6","name":"Protected Area/ Critical Habitat Policy, Planning, and Management","page":279,"office":"Regional Offices"},{"code":"PO7","name":"Implementation of Protected Area Policies","page":280,"office":"Regional Offices"},{"code":"PO8","name":"Protected Area, Critical Habitat, Caves and Wildlife Law Enforcement","page":281,"office":"Regional Offices"},{"code":"PCP1","name":"Planning and Programming","page":283,"office":"P/CENRO"},{"code":"PCP2","name":"Monitoring and Evaluation","page":285,"office":"P/CENRO"},{"code":"PCP3","name":"Statistical Coordination and Data Research","page":286,"office":"P/CENRO"},{"code":"PCIS1","name":"Web Development","page":288,"office":"P/CENRO"},{"code":"PCIS2","name":"Network Systems Management","page":290,"office":"P/CENRO"},{"code":"PCIS3","name":"Information and Communication Technologies (ICT) Resource Management","page":291,"office":"P/CENRO"},{"code":"PCFM1","name":"General Accounting","page":292,"office":"P/CENRO"},{"code":"PCFM2","name":"Budget Preparation","page":294,"office":"P/CENRO"},{"code":"PCFM3","name":"Budget Administration and Control","page":295,"office":"P/CENRO"},{"code":"PCFM4","name":"Cash Management","page":297,"office":"P/CENRO"},{"code":"PCAS1","name":"Procurement Management","page":298,"office":"P/CENRO"},{"code":"PCAS2","name":"Property Management (Property Inventory and Disposal Management)","page":300,"office":"P/CENRO"},{"code":"PCAS3","name":"Records Management","page":302,"office":"P/CENRO"},{"code":"PCAS4","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":304,"office":"P/CENRO"},{"code":"PCAS5","name":"Infrastructure Maintenance System Administration","page":306,"office":"P/CENRO"},{"code":"PCAS6","name":"Vehicle Repair and Maintenance","page":308,"office":"P/CENRO"},{"code":"PCAS7","name":"EMS, Wellness, Security, Safety and Emergency Preparedness","page":309,"office":"P/CENRO"},{"code":"PCAS8","name":"Customer Assistance and Request Handling","page":310,"office":"P/CENRO"},{"code":"PCAS9","name":"Repair and Fabrication","page":311,"office":"P/CENRO"},{"code":"PCAS10","name":"Establishment and Maintenance of Forest Nurseries","page":313,"office":"P/CENRO"},{"code":"PCHR1","name":"Recruitment, Selection and Placement","page":314,"office":"P/CENRO"},{"code":"PCHR2","name":"Compensation, Benefits and Welfare Administration","page":316,"office":"P/CENRO"},{"code":"PCHR3","name":"Processing of Personnel Actions","page":318,"office":"P/CENRO"},{"code":"PCHR4","name":"Grievance Handling","page":319,"office":"P/CENRO"},{"code":"PCHR5","name":"Performance Management","page":320,"office":"P/CENRO"},{"code":"PCHR6","name":"Learning Needs Assessment","page":321,"office":"P/CENRO"},{"code":"PCHR7","name":"Career Development","page":322,"office":"P/CENRO"},{"code":"PCO1","name":"Concept and Application of Integrated Ecosystems Management (IEM)","page":324,"office":"P/CENRO"},{"code":"PCO2","name":"Identification of Interventions and Integrating Strategies Across Sectors (Forestry, Agriculture, Urban, Air Space) and Zoning for Strategic Management","page":325,"office":"P/CENRO"},{"code":"PCO3","name":"Characterization of Ecosystems and Use of Planning Tools and Procedures","page":326,"office":"P/CENRO"},{"code":"PCO4","name":"Resource Management and Restoration/ rehabilitation of Degraded Ecosystems","page":327,"office":"P/CENRO"},{"code":"PCO5","name":"Preparation of Natural Resources Management (NRM)-Related Plans (FLUP, CRMP, ISWMP, IRBM, IWRM)","page":328,"office":"P/CENRO"},{"code":"PCO6","name":"Environment and Natural Resource (ENR) Accounting","page":329,"office":"P/CENRO"},{"code":"PCO7","name":"Strategies and Schemes for Financing Environmental Projects","page":330,"office":"P/CENRO"},{"code":"PCO8","name":"Results-Based Monitoring and Evaluation System (RBME) and Environmental Audit for Different ENRM Sites","page":331,"office":"P/CENRO"},{"code":"PCO9","name":"Environmental Governance","page":333,"office":"P/CENRO"},{"code":"PCO10","name":"Climate Change and Environmental Management","page":334,"office":"P/CENRO"},{"code":"PCO11","name":"Information, Education and Communication, Social Marketing and Extension Support","page":335,"office":"P/CENRO"},{"code":"PCO12","name":"Social Negotiation","page":336,"office":"P/CENRO"},{"code":"PCO13","name":"ENR Law Enforcement","page":337,"office":"P/CENRO"},{"code":"PCO14","name":"Land Disposition and Management","page":339,"office":"P/CENRO"},{"code":"PCO15","name":"Forest, Water and Wildfire Resources Regulation","page":340,"office":"P/CENRO"},{"code":"PCO16","name":"Tenure and Rights Assessment","page":341,"office":"P/CENRO"},{"code":"PCO17","name":"Tenurial Instruments and Permits for Improved Resource Management","page":342,"office":"P/CENRO"},{"code":"PCO18","name":"Geographic Information System (GIS)","page":343,"office":"P/CENRO"},{"code":"PCO19","name":"Surveying","page":344,"office":"P/CENRO"},{"code":"PCO20","name":"Survey Verification","page":346,"office":"P/CENRO"},{"code":"PCO21","name":"Mapping","page":347,"office":"P/CENRO"},{"code":"PCO22","name":"Land Management Information System Administration","page":349,"office":"P/CENRO"},{"code":"PCO23","name":"Land Records Management","page":350,"office":"P/CENRO"},{"code":"PCO24","name":"Forest Resource Inventory and Assessment","page":352,"office":"P/CENRO"},{"code":"PCO25","name":"Scaling, Grading and Assessment of Forest Products","page":353,"office":"P/CENRO"},{"code":"BFM1","name":"General Accounting","page":354,"office":"Biodiversity Management Bureau"},{"code":"BFM2","name":"Budget Preparation","page":356,"office":"Biodiversity Management Bureau"},{"code":"BFM3","name":"Budget Administration and Control","page":357,"office":"Biodiversity Management Bureau"},{"code":"BHR1","name":"Recruitment, Selection and Placement","page":359,"office":"Biodiversity Management Bureau"},{"code":"BHR2","name":"Compensation, Benefits and Welfare Administration","page":361,"office":"Biodiversity Management Bureau"},{"code":"BHR3","name":"Processing of Personnel Actions","page":363,"office":"Biodiversity Management Bureau"},{"code":"BHR4","name":"Grievance Handling","page":364,"office":"Biodiversity Management Bureau"},{"code":"BHR5","name":"Learning Needs Assessment (LNA)","page":365,"office":"Biodiversity Management Bureau"},{"code":"BHR6","name":"Preparation of Learning Design","page":366,"office":"Biodiversity Management Bureau"},{"code":"BHR7","name":"Learning Program Management","page":367,"office":"Biodiversity Management Bureau"},{"code":"BHR8","name":"Learning Event Facilitation","page":368,"office":"Biodiversity Management Bureau"},{"code":"BHR9","name":"Networking and Linkaging with HR Partners","page":369,"office":"Biodiversity Management Bureau"},{"code":"BHR10","name":"Monitoring and Evaluation (M&E) of L&D Programs","page":370,"office":"Biodiversity Management Bureau"},{"code":"BHR11","name":"Scholarship Administration","page":371,"office":"Biodiversity Management Bureau"},{"code":"BHR12","name":"HR Planning","page":372,"office":"Biodiversity Management Bureau"},{"code":"BHR13","name":"Career Development","page":374,"office":"Biodiversity Management Bureau"},{"code":"BA1","name":"Procurement Management","page":375,"office":"Biodiversity Management Bureau"},{"code":"BA2","name":"Property Management (Property Inventory and Disposal Management)","page":376,"office":"Biodiversity Management Bureau"},{"code":"BA3","name":"Records Management","page":378,"office":"Biodiversity Management Bureau"},{"code":"BA4","name":"Computerized Records Management","page":379,"office":"Biodiversity Management Bureau"},{"code":"BA5","name":"Courier, Postal and Messengerial Services","page":380,"office":"Biodiversity Management Bureau"},{"code":"BA6","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":381,"office":"Biodiversity Management Bureau"},{"code":"BA7","name":"Building Maintenance System Administration","page":383,"office":"Biodiversity Management Bureau"},{"code":"BA8","name":"Repair and Fabrication","page":384,"office":"Biodiversity Management Bureau"},{"code":"BA9","name":"Gardening and Landscaping","page":385,"office":"Biodiversity Management Bureau"},{"code":"BA10","name":"Motor Pool Services Management","page":386,"office":"Biodiversity Management Bureau"},{"code":"BA11","name":"Vehicle Repair and Maintenance","page":388,"office":"Biodiversity Management Bureau"},{"code":"BA12","name":"Cash Management","page":389,"office":"Biodiversity Management Bureau"},{"code":"BA13","name":"Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management","page":390,"office":"Biodiversity Management Bureau"},{"code":"BA14","name":"Customer Assistance and Request Handling","page":391,"office":"Biodiversity Management Bureau"},{"code":"BL1","name":"Skills in Legal Research","page":392,"office":"Biodiversity Management Bureau"},{"code":"BL2","name":"Management and Disposition of ENR Appealed Cases and Other Legal Concerns","page":394,"office":"Biodiversity Management Bureau"},{"code":"BL3","name":"Litigation","page":396,"office":"Biodiversity Management Bureau"},{"code":"BL4","name":"Legal Counseling and Alternative Dispute Resolution","page":397,"office":"Biodiversity Management Bureau"},{"code":"BL5","name":"Investigation and Disposition of Administrative Complaints","page":398,"office":"Biodiversity Management Bureau"},{"code":"BP1","name":"Planning and Programming","page":399,"office":"Biodiversity Management Bureau"},{"code":"BP2","name":"Policy Analysis","page":401,"office":"Biodiversity Management Bureau"},{"code":"BP3","name":"Monitoring and Evaluation of BPKMD Programs and Projects","page":402,"office":"Biodiversity Management Bureau"},{"code":"BP4","name":"Managing Media Relations","page":404,"office":"Biodiversity Management Bureau"},{"code":"BIS1","name":"Software Development","page":405,"office":"Biodiversity Management Bureau"},{"code":"BIS2","name":"Systems Analysis and Design","page":406,"office":"Biodiversity Management Bureau"},{"code":"BIS3","name":"Web Development","page":408,"office":"Biodiversity Management Bureau"},{"code":"BIS4","name":"Network Infrastructure Management","page":410,"office":"Biodiversity Management Bureau"},{"code":"BIS5","name":"Network Systems Management","page":411,"office":"Biodiversity Management Bureau"},{"code":"BIS6","name":"Information and Communication Technologies (ICT) Resource Management","page":412,"office":"Biodiversity Management Bureau"},{"code":"BIS7","name":"Statistical Analysis, Data Management and Production of Knowledge Products","page":413,"office":"Biodiversity Management Bureau"},{"code":"BIS8","name":"Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products","page":415,"office":"Biodiversity Management Bureau"},{"code":"B1","name":"Caves, Wetlands and Other Ecosystems Resources Management","page":416,"office":"Biodiversity Management Bureau"},{"code":"B2","name":"Protected Area Management","page":417,"office":"Biodiversity Management Bureau"},{"code":"B3","name":"Management of Socio-Economics and Cultural Concerns","page":420,"office":"Biodiversity Management Bureau"},{"code":"B4","name":"Coastal and Marine Biodiversity Management","page":421,"office":"Biodiversity Management Bureau"},{"code":"B5","name":"Coastal Hazard Management","page":425,"office":"Biodiversity Management Bureau"},{"code":"B6","name":"Conservation and Management of Wildlife Resources","page":426,"office":"Biodiversity Management Bureau"},{"code":"B7","name":"Care and Management of Captive Wildlife (ex-siu)","page":429,"office":"Biodiversity Management Bureau"},{"code":"B8","name":"Ecotourism Development and Management","page":431,"office":"Biodiversity Management Bureau"},{"code":"B9","name":"Natural Resources Assessment - Biological and Physical","page":433,"office":"Biodiversity Management Bureau"},{"code":"B10","name":"Monitoring and Implementation of Protected Area Policies","page":434,"office":"Biodiversity Management Bureau"},{"code":"B11","name":"Protected Area, Critical Habitat, Caves, and Wildlife Law Enforcement","page":435,"office":"Biodiversity Management Bureau"},{"code":"B12","name":"Promotion of Biodiversity-Based Products Through Communication, Education, and Public Awareness (CEPA) Activities","page":437,"office":"Biodiversity Management Bureau"},{"code":"BFM1","name":"General Accounting","page":439,"office":"Ecosystems Research and Development Bureau"},{"code":"BFM2","name":"Budget Preparation","page":441,"office":"Ecosystems Research and Development Bureau"},{"code":"BFM3","name":"Budget Administration and Control","page":442,"office":"Ecosystems Research and Development Bureau"},{"code":"BFM4","name":"Organizational and Management Systems Improvement","page":444,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR1","name":"Recruitment, Selection, and Placement","page":446,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR2","name":"Compensation, Benefits, and Welfare Administration","page":448,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR3","name":"Processing of Personnel Actions","page":450,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR4","name":"Grievance Handling","page":451,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR5","name":"Learning Needs Assessment (LNA)","page":452,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR6","name":"Preparation of Learning Design","page":453,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR7","name":"Learning Program Management","page":454,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR8","name":"Learning Event Facilitation","page":455,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR9","name":"Networking and Linkaging with HR Partners","page":456,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR10","name":"Monitoring and Evaluation (M&E) of L&D Programs","page":457,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR11","name":"Scholarship Administration","page":458,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR12","name":"HR Planning","page":459,"office":"Ecosystems Research and Development Bureau"},{"code":"BHR13","name":"Career Development","page":461,"office":"Ecosystems Research and Development Bureau"},{"code":"BA1","name":"Procurement Management","page":462,"office":"Ecosystems Research and Development Bureau"},{"code":"BA2","name":"Property Management (Property Inventory and Disposal Management)","page":463,"office":"Ecosystems Research and Development Bureau"},{"code":"BA3","name":"Records Management","page":465,"office":"Ecosystems Research and Development Bureau"},{"code":"BA4","name":"Computerized Records Management","page":466,"office":"Ecosystems Research and Development Bureau"},{"code":"BA5","name":"Courier, Postal, and Messengerial Services","page":467,"office":"Ecosystems Research and Development Bureau"},{"code":"BA6","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":468,"office":"Ecosystems Research and Development Bureau"},{"code":"BA7","name":"Building Maintenance System Administration","page":470,"office":"Ecosystems Research and Development Bureau"},{"code":"BA8","name":"Repair and Fabrication","page":471,"office":"Ecosystems Research and Development Bureau"},{"code":"BA9","name":"Gardening and Landscaping","page":472,"office":"Ecosystems Research and Development Bureau"},{"code":"BA10","name":"Motor Pool Services Management","page":473,"office":"Ecosystems Research and Development Bureau"},{"code":"BA11","name":"Vehicle Repair and Maintenance","page":475,"office":"Ecosystems Research and Development Bureau"},{"code":"BA12","name":"Cash Management","page":476,"office":"Ecosystems Research and Development Bureau"},{"code":"BA13","name":"Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management","page":477,"office":"Ecosystems Research and Development Bureau"},{"code":"BA14","name":"Customer Assistance and Request Handling","page":478,"office":"Ecosystems Research and Development Bureau"},{"code":"BA15","name":"Driving","page":479,"office":"Ecosystems Research and Development Bureau"},{"code":"BA16","name":"Building Maintenance System Administration","page":481,"office":"Ecosystems Research and Development Bureau"},{"code":"BA17","name":"Basic Accounting and Cash Management","page":482,"office":"Ecosystems Research and Development Bureau"},{"code":"BA18","name":"Procurement Management","page":484,"office":"Ecosystems Research and Development Bureau"},{"code":"BA19","name":"Property and Supply Management","page":486,"office":"Ecosystems Research and Development Bureau"},{"code":"BL1","name":"Skills in Legal Research","page":488,"office":"Ecosystems Research and Development Bureau"},{"code":"BL2","name":"Management and Disposition of ENR Appealed Cases and other Legal Concerns","page":490,"office":"Ecosystems Research and Development Bureau"},{"code":"BL3","name":"Litigation","page":492,"office":"Ecosystems Research and Development Bureau"},{"code":"BL4","name":"Legal Counselling and Alternative Dispute Resolution","page":493,"office":"Ecosystems Research and Development Bureau"},{"code":"BL5","name":"Investigation and Disposition of Administrative Complaints","page":494,"office":"Ecosystems Research and Development Bureau"},{"code":"BP1","name":"Planning and Programming","page":495,"office":"Ecosystems Research and Development Bureau"},{"code":"BP2","name":"Policy Analysis","page":497,"office":"Ecosystems Research and Development Bureau"},{"code":"BP3","name":"Monitoring and Evaluation of DENR Programs and Projects","page":498,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS1","name":"Application Systems Development","page":500,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS2","name":"Systems Analysis and Design","page":501,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS3","name":"Network Infrastructure Management","page":503,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS4","name":"Network Systems Management","page":504,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS5","name":"Information and Communication Technologies (ICT) Resource Management","page":505,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS6","name":"Statistical Analysis, Data Management and Production of Knowledge Products","page":506,"office":"Ecosystems Research and Development Bureau"},{"code":"BIS7","name":"Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products","page":508,"office":"Ecosystems Research and Development Bureau"},{"code":"R1","name":"Technology Generation","page":510,"office":"Ecosystems Research and Development Bureau"},{"code":"R2","name":"Monitoring, Evaluation and Clearing House of Research, Development and Extension (RDE) Projects/ Activities","page":512,"office":"Ecosystems Research and Development Bureau"},{"code":"R3","name":"Technology Assessment and Packaging","page":513,"office":"Ecosystems Research and Development Bureau"},{"code":"R4","name":"Technology Promotion and Extension","page":514,"office":"Ecosystems Research and Development Bureau"},{"code":"R5","name":"Laboratory Management","page":516,"office":"Ecosystems Research and Development Bureau"},{"code":"R6","name":"Demonstration and Experimental Forests/sites Management","page":517,"office":"Ecosystems Research and Development Bureau"},{"code":"R7","name":"Managing Library and Information Resources","page":518,"office":"Ecosystems Research and Development Bureau"},{"code":"R8","name":"Forest Plantation Establishments, Maintenance and Protection","page":520,"office":"Ecosystems Research and Development Bureau"},{"code":"BFM1","name":"General Accounting","page":521,"office":"Forest Management Bureau"},{"code":"BFM2","name":"Budget Preparation","page":523,"office":"Forest Management Bureau"},{"code":"BFM3","name":"Budget Administration and Control","page":524,"office":"Forest Management Bureau"},{"code":"BHR1","name":"Recruitment, Selection, and Placement","page":526,"office":"Forest Management Bureau"},{"code":"BHR2","name":"Compensation, Benefits, and Welfare Administration","page":528,"office":"Forest Management Bureau"},{"code":"BHR3","name":"Processing of Personnel Actions","page":530,"office":"Forest Management Bureau"},{"code":"BHR4","name":"Grievance Handling","page":531,"office":"Forest Management Bureau"},{"code":"BHR5","name":"Learning Needs Assessment (LNA)","page":532,"office":"Forest Management Bureau"},{"code":"BHR6","name":"Preparation of Learning Design","page":533,"office":"Forest Management Bureau"},{"code":"BHR7","name":"Learning Program Management","page":534,"office":"Forest Management Bureau"},{"code":"BHR8","name":"Learning Event Facilitation","page":535,"office":"Forest Management Bureau"},{"code":"BHR9","name":"Networking and Linkaging with HR Partners","page":536,"office":"Forest Management Bureau"},{"code":"BHR10","name":"Monitoring and Evaluation (M&E) of L&D Programs","page":537,"office":"Forest Management Bureau"},{"code":"BHR11","name":"Scholarship Administration","page":538,"office":"Forest Management Bureau"},{"code":"BHR12","name":"HR Planning","page":539,"office":"Forest Management Bureau"},{"code":"BHR13","name":"Career Development","page":541,"office":"Forest Management Bureau"},{"code":"BA1","name":"Procurement Management","page":542,"office":"Forest Management Bureau"},{"code":"BA2","name":"Property Management(Property Inventory and Disposal Management)","page":543,"office":"Forest Management Bureau"},{"code":"BA3","name":"Records Management","page":545,"office":"Forest Management Bureau"},{"code":"BA4","name":"Computerized Records Management","page":546,"office":"Forest Management Bureau"},{"code":"BA5","name":"Courier, Postal, and Messengerial Services","page":547,"office":"Forest Management Bureau"},{"code":"BA6","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":548,"office":"Forest Management Bureau"},{"code":"BA7","name":"Building Maintenance System Administration","page":550,"office":"Forest Management Bureau"},{"code":"BA8","name":"Repair and Fabrication","page":551,"office":"Forest Management Bureau"},{"code":"BA9","name":"Gardening and Landscaping","page":552,"office":"Forest Management Bureau"},{"code":"BA10","name":"Motor Pool Services Management","page":553,"office":"Forest Management Bureau"},{"code":"BA11","name":"Vehicle Repair and Maintenance","page":555,"office":"Forest Management Bureau"},{"code":"BA12","name":"Cash Management","page":556,"office":"Forest Management Bureau"},{"code":"BA13","name":"Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management","page":557,"office":"Forest Management Bureau"},{"code":"BA14","name":"Customer Assistance and Request Handling","page":558,"office":"Forest Management Bureau"},{"code":"BL1","name":"Skills in Legal Research","page":559,"office":"Forest Management Bureau"},{"code":"BL2","name":"Management and Disposition of ENR Appealed Cases and Other Legal Concerns","page":561,"office":"Forest Management Bureau"},{"code":"BL3","name":"Litigation","page":563,"office":"Forest Management Bureau"},{"code":"BL4","name":"Legal Counseling and Alternative Dispute Resolution","page":564,"office":"Forest Management Bureau"},{"code":"BL5","name":"Investigation and Disposition of Administrative Complaints","page":565,"office":"Forest Management Bureau"},{"code":"BP1","name":"Planning and Programming","page":566,"office":"Forest Management Bureau"},{"code":"BP2","name":"Policy Analysis","page":568,"office":"Forest Management Bureau"},{"code":"BP3","name":"Monitoring and Evaluation of DENR Programs and Projects","page":569,"office":"Forest Management Bureau"},{"code":"BIS1","name":"Application Systems Development","page":571,"office":"Forest Management Bureau"},{"code":"BIS2","name":"System Analysis and Design","page":572,"office":"Forest Management Bureau"},{"code":"BIS3","name":"Network Infrastructure Management","page":574,"office":"Forest Management Bureau"},{"code":"BIS4","name":"Network Systems Management","page":575,"office":"Forest Management Bureau"},{"code":"BIS5","name":"Information and Communication Technologies (ICT) Resource Management","page":576,"office":"Forest Management Bureau"},{"code":"BIS6","name":"Statistical Analysis, Data Management, and Production of Knowledge Products","page":577,"office":"Forest Management Bureau"},{"code":"BIS7","name":"Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products","page":579,"office":"Forest Management Bureau"},{"code":"F1","name":"Forest Land Use Planning","page":581,"office":"Forest Management Bureau"},{"code":"F2","name":"Forest Resource Inventory and Assessment","page":583,"office":"Forest Management Bureau"},{"code":"F3","name":"Natural Forest Productivity Improvement","page":584,"office":"Forest Management Bureau"},{"code":"F4","name":"Forest Harvesting and Utilization","page":585,"office":"Forest Management Bureau"},{"code":"F5","name":"Scaling, Grading, and Assessment of Forest Products","page":586,"office":"Forest Management Bureau"},{"code":"F6","name":"Establishment and Maintenance of Forest Nurseries","page":587,"office":"Forest Management Bureau"},{"code":"F7","name":"Rehabilitation and Management of Watersheds","page":588,"office":"Forest Management Bureau"},{"code":"F8","name":"Sustainable Management of Grazing Lands","page":589,"office":"Forest Management Bureau"},{"code":"F9","name":"Forest Plantation Establishment, Maintenance and Protection","page":590,"office":"Forest Management Bureau"},{"code":"F10","name":"Enforcement of Forest Laws, Rules and Regulations","page":591,"office":"Forest Management Bureau"},{"code":"BA1","name":"Procurement Management","page":592,"office":"Land Management Bureau"},{"code":"BA2","name":"Property Management","page":593,"office":"Land Management Bureau"},{"code":"BA3","name":"Courier, Postal, and Messengerial Services","page":594,"office":"Land Management Bureau"},{"code":"BA4","name":"Repair and Maintenance","page":595,"office":"Land Management Bureau"},{"code":"BA5","name":"Repair and Fabrication","page":596,"office":"Land Management Bureau"},{"code":"BA6","name":"Motor Pool Services Management","page":597,"office":"Land Management Bureau"},{"code":"BA7","name":"Vehicle Repair and Maintenance","page":598,"office":"Land Management Bureau"},{"code":"BA8","name":"Cash Management","page":599,"office":"Land Management Bureau"},{"code":"BA9","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":600,"office":"Land Management Bureau"},{"code":"BA10","name":"Customer Assistance and Request Handling","page":601,"office":"Land Management Bureau"},{"code":"BHR1","name":"Recruitment, Selection and Placement","page":602,"office":"Land Management Bureau"},{"code":"BHR2","name":"Compensation, Benefits, and Welfare Administration","page":604,"office":"Land Management Bureau"},{"code":"BHR3","name":"Processing of Personnel Actions","page":605,"office":"Land Management Bureau"},{"code":"BHR4","name":"Grievance Handling","page":606,"office":"Land Management Bureau"},{"code":"BHR5","name":"HR Planning","page":607,"office":"Land Management Bureau"},{"code":"BHR6","name":"Learning Needs Assessment (LNA)","page":608,"office":"Land Management Bureau"},{"code":"BHR7","name":"Preparation of Learning Design","page":609,"office":"Land Management Bureau"},{"code":"BHR8","name":"Learning Program Management","page":610,"office":"Land Management Bureau"},{"code":"BHR9","name":"Learning Event Facilitation","page":611,"office":"Land Management Bureau"},{"code":"BHR10","name":"Networking and Linkaging with HR Partners","page":612,"office":"Land Management Bureau"},{"code":"BHR11","name":"Monitoring and Evaluation (M&E) of L&D Programs","page":613,"office":"Land Management Bureau"},{"code":"BHR12","name":"Scholarship Administration","page":614,"office":"Land Management Bureau"},{"code":"BHR13","name":"Career Development","page":615,"office":"Land Management Bureau"},{"code":"BFM1","name":"General Accounting","page":616,"office":"Land Management Bureau"},{"code":"BFM2","name":"Budget Preparation","page":618,"office":"Land Management Bureau"},{"code":"BFM3","name":"Budget Administration and Control","page":619,"office":"Land Management Bureau"},{"code":"BP1","name":"Planning and Programming","page":621,"office":"Land Management Bureau"},{"code":"BP2","name":"Policy Analysis and Development","page":623,"office":"Land Management Bureau"},{"code":"BP3","name":"Monitoring and Evaluation of Lands Programs. Projects and Activities","page":625,"office":"Land Management Bureau"},{"code":"BIS1","name":"Information Systems and Application Software Development and Maintenance","page":627,"office":"Land Management Bureau"},{"code":"BIS2","name":"Network Infrastructure and System Management","page":629,"office":"Land Management Bureau"},{"code":"BIS3","name":"Information and Communication Technologies (ICT) Resource Management","page":631,"office":"Land Management Bureau"},{"code":"BIS4","name":"Cyber Security and Information Security","page":632,"office":"Land Management Bureau"},{"code":"BIS5","name":"Statistical and Spatial Analyses and Data Management","page":633,"office":"Land Management Bureau"},{"code":"L1","name":"Surveying","page":635,"office":"Land Management Bureau"},{"code":"L2","name":"Mapping","page":636,"office":"Land Management Bureau"},{"code":"L3","name":"Survey Verification","page":637,"office":"Land Management Bureau"},{"code":"L4","name":"Land Management","page":638,"office":"Land Management Bureau"},{"code":"L5","name":"Land Disposition","page":639,"office":"Land Management Bureau"},{"code":"L6","name":"Investigation and Resolution of Land Claims and Conflicts Cases and Administrative Complaints","page":640,"office":"Land Management Bureau"},{"code":"L7","name":"Land Records and Knowledge Management","page":642,"office":"Land Management Bureau"},{"code":"L8","name":"Land Administration and Management System","page":643,"office":"Land Management Bureau"},{"code":"L9","name":"Litigation","page":644,"office":"Land Management Bureau"},{"code":"AS1","name":"Cash Management","page":649,"office":"Environmental Management Bureau"},{"code":"AS2","name":"Procurement Management","page":650,"office":"Environmental Management Bureau"},{"code":"AS3","name":"Property Management (Property Inventory and Disposal Management)","page":652,"office":"Environmental Management Bureau"},{"code":"AS4","name":"Building Maintenance System Administration","page":654,"office":"Environmental Management Bureau"},{"code":"AS5","name":"Records Management","page":655,"office":"Environmental Management Bureau"},{"code":"AS6","name":"Computerized Records Management","page":656,"office":"Environmental Management Bureau"},{"code":"AS7","name":"Courier, Postal and Messengerial Services","page":657,"office":"Environmental Management Bureau"},{"code":"AS8","name":"General Accounting","page":658,"office":"Environmental Management Bureau"},{"code":"AS9","name":"Organization and Management Systems Improvement","page":660,"office":"Environmental Management Bureau"},{"code":"AS10","name":"Budget Preparation","page":662,"office":"Environmental Management Bureau"},{"code":"AS11","name":"Budget Administration and Control","page":663,"office":"Environmental Management Bureau"},{"code":"AS12","name":"Recruitment, Selection and Placement","page":665,"office":"Environmental Management Bureau"},{"code":"AS13","name":"Learning and Development","page":666,"office":"Environmental Management Bureau"},{"code":"AS14","name":"Compensation, Benefits and Welfare Administration","page":668,"office":"Environmental Management Bureau"},{"code":"AS15","name":"Performance Management","page":669,"office":"Environmental Management Bureau"},{"code":"AS16","name":"Handling of Human Resource Actions","page":670,"office":"Environmental Management Bureau"},{"code":"AS17","name":"Workforce Planning","page":671,"office":"Environmental Management Bureau"},{"code":"AS18","name":"EMS Wellness, Security, Safety, Emergency Preparedness and Disaster Management","page":672,"office":"Environmental Management Bureau"},{"code":"EP1","name":"Environmental Planning, Programming and Evaluation","page":673,"office":"Environmental Management Bureau"},{"code":"EP2","name":"Policy Review and Analysis","page":675,"office":"Environmental Management Bureau"},{"code":"EP3","name":"Project Monitoring","page":677,"office":"Environmental Management Bureau"},{"code":"EP4","name":"Statistics and Information Systems Management","page":680,"office":"Environmental Management Bureau"},{"code":"IS1","name":"Application Systems Development","page":682,"office":"Environmental Management Bureau"},{"code":"IS2","name":"Systems Analysis and Design","page":683,"office":"Environmental Management Bureau"},{"code":"IS3","name":"Network Infrastructure Management","page":685,"office":"Environmental Management Bureau"},{"code":"IS4","name":"Network Systems Management","page":686,"office":"Environmental Management Bureau"},{"code":"IS5","name":"Information Communication Technologies (ICT) Resource Management","page":687,"office":"Environmental Management Bureau"},{"code":"IS6","name":"Statistical Analysis, Data Management and Production of Knowledge Products","page":688,"office":"Environmental Management Bureau"},{"code":"IS7","name":"Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products","page":690,"office":"Environmental Management Bureau"},{"code":"EL1","name":"Skills in Legal Research/ Opinion Disposition/ Management of Cases","page":692,"office":"Environmental Management Bureau"},{"code":"EL2","name":"Disposition/ Management of Cases","page":695,"office":"Environmental Management Bureau"},{"code":"EL3","name":"Legal Counseling and Arbitration","page":697,"office":"Environmental Management Bureau"},{"code":"EL4","name":"Adjudication of Pollution Cases","page":697,"office":"Environmental Management Bureau"},{"code":"EQ1","name":"Water Quality Management Policy Formulation","page":698,"office":"Environmental Management Bureau"},{"code":"EQ2","name":"Monitoring and Evaluation/ Validation of Policy Implementation","page":700,"office":"Environmental Management Bureau"},{"code":"EQ3","name":"Provision of Technical Assistance and Emergency Response on WQM","page":702,"office":"Environmental Management Bureau"},{"code":"EQ4","name":"Capacity Building on WQM","page":704,"office":"Environmental Management Bureau"},{"code":"EQ5","name":"Air Quality Management Policy Formulation","page":706,"office":"Environmental Management Bureau"},{"code":"EQ6","name":"Monitoring and Evaluation of Air Quality Management Policy","page":709,"office":"Environmental Management Bureau"},{"code":"EQ7","name":"Validation of the Implementation of Air Quality Policies and Procedures at the Regional Offices","page":711,"office":"Environmental Management Bureau"},{"code":"EQ8","name":"Processing of Environmental Certificate Related to Air Quality Management","page":713,"office":"Environmental Management Bureau"},{"code":"EQ9","name":"Enforcement of AQM Environment Laws","page":715,"office":"Environmental Management Bureau"},{"code":"EQ10","name":"Capability Building on AQM","page":717,"office":"Environmental Management Bureau"},{"code":"EQ11","name":"Policy Formulation on Hazardous Waste Management (HWM)","page":719,"office":"Environmental Management Bureau"},{"code":"EQ12","name":"Monitoring and Evaluation of Compliance of Facilities or Establishments","page":721,"office":"Environmental Management Bureau"},{"code":"EQ13","name":"Validation of Implementation of HWM Policies and Procedures at the Regional Offices","page":723,"office":"Environmental Management Bureau"},{"code":"EQ14","name":"Processing of Registration Certificates and Clearances","page":724,"office":"Environmental Management Bureau"},{"code":"EQ15","name":"Technical Assistance and Emergency Response Management","page":725,"office":"Environmental Management Bureau"},{"code":"EQ16","name":"Enforcement of Hazardous Waste Management Laws","page":727,"office":"Environmental Management Bureau"},{"code":"EQ17","name":"Capability Building on Hazardous Waste Management","page":729,"office":"Environmental Management Bureau"},{"code":"EQ18","name":"Chemical Management Policy Formulation","page":731,"office":"Environmental Management Bureau"},{"code":"EQ19","name":"Monitoring and Evaluation of Industrial Compliance to Chemical-Related Permits and Clearances","page":733,"office":"Environmental Management Bureau"},{"code":"EQ20","name":"Validation of Implementing Chemical Policies, Procedures and Practices at the Regional Offices","page":735,"office":"Environmental Management Bureau"},{"code":"EQ21","name":"Processing of Environmental Permits and Clearances Related to Chemical Management","page":737,"office":"Environmental Management Bureau"},{"code":"EQ22","name":"Technical Assistance and Emergency Response Management","page":739,"office":"Environmental Management Bureau"},{"code":"EQ23","name":"Enforcement of Chemical Management Laws","page":741,"office":"Environmental Management Bureau"},{"code":"EQ24","name":"Capability Building on Chemical Management","page":743,"office":"Environmental Management Bureau"},{"code":"EQ25","name":"Environmental Quality Management System","page":745,"office":"Environmental Management Bureau"},{"code":"EQ26","name":"Management of Multilateral Environmental Agreements (MEAS)","page":746,"office":"Environmental Management Bureau"},{"code":"EQ27","name":"Linkaging and Networking (Technical Cooperation, Interagency Committees)","page":748,"office":"Environmental Management Bureau"},{"code":"EQ28","name":"Development of EQD-Information-Education and Communication Materials","page":749,"office":"Environmental Management Bureau"},{"code":"EQ29","name":"Environmental Quality Database Administration","page":751,"office":"Environmental Management Bureau"},{"code":"EI1","name":"Environmental Impact Evaluation","page":753,"office":"Environmental Management Bureau"},{"code":"EI2","name":"EIA Monitoring and Audit","page":754,"office":"Environmental Management Bureau"},{"code":"EI3","name":"EIA Policy and Standards Formulation and Implementation Assessment","page":756,"office":"Environmental Management Bureau"},{"code":"EI4","name":"Capacity Building on EIA","page":757,"office":"Environmental Management Bureau"},{"code":"EI5","name":"Linkaging and Networking (Technical Cooperation, Interagency Committees)","page":758,"office":"Environmental Management Bureau"},{"code":"EI6","name":"Development/ Dissemination of PEISS Information","page":759,"office":"Environmental Management Bureau"},{"code":"EI7","name":"EIA Document Tracking and Information System Management","page":760,"office":"Environmental Management Bureau"},{"code":"ER1","name":"Environmental Research Generation","page":761,"office":"Environmental Management Bureau"},{"code":"ER2","name":"Collection of Environmental Samples","page":763,"office":"Environmental Management Bureau"},{"code":"ER3","name":"Collection of Environmental Data","page":764,"office":"Environmental Management Bureau"},{"code":"ER4","name":"Data Analysis and Interpretation","page":765,"office":"Environmental Management Bureau"},{"code":"ER5","name":"Documentation and Dissemination of Results","page":766,"office":"Environmental Management Bureau"},{"code":"ER6","name":"Analysis of Environmental Samples","page":767,"office":"Environmental Management Bureau"},{"code":"ER7","name":"Equipment Maintenance and Calibration","page":770,"office":"Environmental Management Bureau"},{"code":"ER8","name":"Recognition of DENR Environmental Laboratories","page":771,"office":"Environmental Management Bureau"},{"code":"EE1","name":"Curriculum Review and Development for Environmental Education","page":773,"office":"Environmental Management Bureau"},{"code":"EE2","name":"Capability Building on Environmental Management","page":775,"office":"Environmental Management Bureau"},{"code":"EE3","name":"Public Information Management","page":776,"office":"Environmental Management Bureau"},{"code":"EE4","name":"Special Events Management","page":777,"office":"Environmental Management Bureau"},{"code":"EE5","name":"IEC Materials Production","page":778,"office":"Environmental Management Bureau"},{"code":"EE6","name":"Environmental report Documentation and Library Management of Environmental Education Resources","page":780,"office":"Environmental Management Bureau"},{"code":"EW1","name":"Policy Research and Development on ESWM","page":782,"office":"Environmental Management Bureau"},{"code":"EW2","name":"Technical Assistance on ESWM","page":783,"office":"Environmental Management Bureau"},{"code":"EW3","name":"Training and Information Dissemination on ESWM","page":784,"office":"Environmental Management Bureau"},{"code":"ERO1","name":"Water Quality Management","page":785,"office":"Environmental Management Bureau"},{"code":"ERO2","name":"Air Quality Management","page":787,"office":"Environmental Management Bureau"},{"code":"ERO3","name":"Toxic Chemicals and Hazardous Waste Management","page":789,"office":"Environmental Management Bureau"},{"code":"ERO4","name":"Analysis of Environmental Samples","page":791,"office":"Environmental Management Bureau"},{"code":"ERO5","name":"Environmental Impact Assessment","page":793,"office":"Environmental Management Bureau"},{"code":"ERO6","name":"EIA Monitoring and Audit","page":795,"office":"Environmental Management Bureau"},{"code":"ERO7","name":"Environmental Planning","page":797,"office":"Environmental Management Bureau"},{"code":"ERO8","name":"Statistics and Information Systems Management","page":799,"office":"Environmental Management Bureau"},{"code":"ERO9","name":"Environmental Information and Education","page":801,"office":"Environmental Management Bureau"},{"code":"ERO10","name":"Skills in Legal Research/ Opinion Disposition/ Management of Cases","page":802,"office":"Environmental Management Bureau"},{"code":"ERO11","name":"Legal Counseling and Arbitration","page":805,"office":"Environmental Management Bureau"},{"code":"ERO12","name":"Solid Waste Monitoring and Assessment","page":807,"office":"Environmental Management Bureau"},{"code":"ERO13","name":"Technical Assistance on ESWM","page":808,"office":"Environmental Management Bureau"},{"code":"ERO14","name":"Training and Information Dissemination on ESWM","page":809,"office":"Environmental Management Bureau"},{"code":"FM1","name":"General Accounting","page":816,"office":"Mines and Geosciences Bureau"},{"code":"FM2","name":"Budget Preparation","page":818,"office":"Mines and Geosciences Bureau"},{"code":"FM3","name":"Budget Administration and Control","page":819,"office":"Mines and Geosciences Bureau"},{"code":"AD1","name":"Cash Management","page":821,"office":"Mines and Geosciences Bureau"},{"code":"AD2","name":"Recruitment, Selection, and Placement","page":822,"office":"Mines and Geosciences Bureau"},{"code":"AD3","name":"Personnel Management","page":824,"office":"Mines and Geosciences Bureau"},{"code":"AD4","name":"Training Management","page":827,"office":"Mines and Geosciences Bureau"},{"code":"AD5","name":"Procurement Management","page":831,"office":"Mines and Geosciences Bureau"},{"code":"AD6","name":"Property Management","page":833,"office":"Mines and Geosciences Bureau"},{"code":"AD7","name":"Records Management","page":835,"office":"Mines and Geosciences Bureau"},{"code":"AD8","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":836,"office":"Mines and Geosciences Bureau"},{"code":"AD9","name":"Emergency Preparedness and Disaster Management","page":838,"office":"Mines and Geosciences Bureau"},{"code":"AD10","name":"Driving","page":839,"office":"Mines and Geosciences Bureau"},{"code":"AD11","name":"Building Maintenance System Administration","page":841,"office":"Mines and Geosciences Bureau"},{"code":"AD12","name":"Repair and Fabrication","page":842,"office":"Mines and Geosciences Bureau"},{"code":"AD13","name":"Motor Pool Services Management","page":843,"office":"Mines and Geosciences Bureau"},{"code":"AD14","name":"Hostel Administration","page":844,"office":"Mines and Geosciences Bureau"},{"code":"AD15","name":"Vehicle Repair and Maintenance","page":845,"office":"Mines and Geosciences Bureau"},{"code":"LA1","name":"Skills in Legal Research","page":846,"office":"Mines and Geosciences Bureau"},{"code":"LA2","name":"Disposition/Management of Cases","page":847,"office":"Mines and Geosciences Bureau"},{"code":"LA3","name":"Investigation and Disposition of ENR (Mining-Related) and Administrative Complaints","page":849,"office":"Mines and Geosciences Bureau"},{"code":"LS1","name":"Legal Note Taking","page":851,"office":"Mines and Geosciences Bureau"},{"code":"LS2","name":"Legal Records Management","page":852,"office":"Mines and Geosciences Bureau"},{"code":"LS3","name":"Clerical/ Secretarial/ Executive Assistance Skills","page":853,"office":"Mines and Geosciences Bureau"},{"code":"MP1","name":"Mines and Geosciences Planning and Programming","page":855,"office":"Mines and Geosciences Bureau"},{"code":"MP2","name":"Monitoring and Evaluation of MGB Programs and Projects","page":857,"office":"Mines and Geosciences Bureau"},{"code":"MP3","name":"Policy Review and Coordination","page":859,"office":"Mines and Geosciences Bureau"},{"code":"MP4","name":"Technology Management","page":860,"office":"Mines and Geosciences Bureau"},{"code":"MP5","name":"System and Technology Innovation and Management","page":862,"office":"Mines and Geosciences Bureau"},{"code":"ME1","name":"Conduct of Studies on the Economic Evaluation of the Financial Aspect of Mining Project Feasibility Study (FS), Project Description (PD), ABD Qualification for Tax Exemption for Mining and Metallurgical Projects","page":864,"office":"Mines and Geosciences Bureau"},{"code":"ME2","name":"Determination and Monitoring of Government Share from FTAA Projects","page":866,"office":"Mines and Geosciences Bureau"},{"code":"ME3","name":"Statistical Coordination and Data Research","page":867,"office":"Mines and Geosciences Bureau"},{"code":"ME4","name":"Public Information and Advocacy Management","page":869,"office":"Mines and Geosciences Bureau"},{"code":"ME5","name":"Photography/ Video Production","page":871,"office":"Mines and Geosciences Bureau"},{"code":"ME6","name":"Web Publication/ Social Media Skills","page":872,"office":"Mines and Geosciences Bureau"},{"code":"ME7","name":"Visual Communication (Graphic and Layout Designing)","page":873,"office":"Mines and Geosciences Bureau"},{"code":"ME8","name":"Event Management","page":874,"office":"Mines and Geosciences Bureau"},{"code":"ME9","name":"Networking Skills","page":875,"office":"Mines and Geosciences Bureau"},{"code":"ME10","name":"Networking Skills","page":875,"office":"Mines and Geosciences Bureau"},{"code":"ME11","name":"Library Management","page":876,"office":"Mines and Geosciences Bureau"},{"code":"ME12","name":"Applications Development","page":877,"office":"Mines and Geosciences Bureau"},{"code":"ME13","name":"Systems Analysis and Design","page":878,"office":"Mines and Geosciences Bureau"},{"code":"ME14","name":"Web Development","page":879,"office":"Mines and Geosciences Bureau"},{"code":"ME15","name":"Systems Management","page":880,"office":"Mines and Geosciences Bureau"},{"code":"MS1","name":"Mine Safety and Health Management","page":881,"office":"Mines and Geosciences Bureau"},{"code":"MS2","name":"Social/Community Development and Management","page":883,"office":"Mines and Geosciences Bureau"},{"code":"MS3","name":"Mine Environmental and Rehabilitation Management","page":885,"office":"Mines and Geosciences Bureau"},{"code":"MT1","name":"Mining Project Technical Evaluation","page":888,"office":"Mines and Geosciences Bureau"},{"code":"MT2","name":"Mining Project Technical Audit","page":890,"office":"Mines and Geosciences Bureau"},{"code":"MT3","name":"Mining/ Exploration Database Management","page":892,"office":"Mines and Geosciences Bureau"},{"code":"MT4","name":"Mineral Rights Management System","page":894,"office":"Mines and Geosciences Bureau"},{"code":"MT5","name":"Geodetic Survey Management","page":896,"office":"Mines and Geosciences Bureau"},{"code":"MM1","name":"Coastal Geohazard Survey","page":897,"office":"Mines and Geosciences Bureau"},{"code":"MM2","name":"Coastal and Marine Mineral Resources Assessment","page":898,"office":"Mines and Geosciences Bureau"},{"code":"MM3","name":"Marine Geological and Geophysical Survey","page":900,"office":"Mines and Geosciences Bureau"},{"code":"MM4","name":"Ship Operation and Maintenance Management","page":902,"office":"Mines and Geosciences Bureau"},{"code":"MG1","name":"Generation of Maps and Reports","page":903,"office":"Mines and Geosciences Bureau"},{"code":"MG2","name":"Digital Geologic Information and Data System Management","page":905,"office":"Mines and Geosciences Bureau"},{"code":"MG3","name":"Laboratory Analyses and Services","page":907,"office":"Mines and Geosciences Bureau"},{"code":"MH1","name":"Mine Technology Development","page":909,"office":"Mines and Geosciences Bureau"},{"code":"MH2","name":"Mineral Reserves Inventory","page":910,"office":"Mines and Geosciences Bureau"},{"code":"MH3","name":"Small-Scale Mining Development","page":911,"office":"Mines and Geosciences Bureau"},{"code":"MH4","name":"Mine Evaluation and Enforcement","page":912,"office":"Mines and Geosciences Bureau"},{"code":"MET1","name":"Provision of Metallurgical and Fire Assay Tests","page":913,"office":"Mines and Geosciences Bureau"},{"code":"MET2","name":"Conduct of Metallurgical Research","page":915,"office":"Mines and Geosciences Bureau"},{"code":"MET3","name":"Provision of Chemical and Physical Tests","page":917,"office":"Mines and Geosciences Bureau"},{"code":"MET4","name":"Provision of Mechanical-Electrical Services","page":918,"office":"Mines and Geosciences Bureau"},{"code":"MET5","name":"Conduct of Mineral Processing Permit Audit","page":919,"office":"Mines and Geosciences Bureau"},{"code":"MRO1","name":"Mining Project Technical Evaluation","page":920,"office":"Mines and Geosciences Bureau"},{"code":"MRO2","name":"Mining Investigation and Technical Assistance","page":921,"office":"Mines and Geosciences Bureau"},{"code":"MRO3","name":"Mining Project Monitoring","page":923,"office":"Mines and Geosciences Bureau"},{"code":"MRO4","name":"Mining/Exploration on Database Management","page":925,"office":"Mines and Geosciences Bureau"},{"code":"MRO5","name":"Mineral Rights Management System","page":927,"office":"Mines and Geosciences Bureau"},{"code":"MRO6","name":"Geodetic Survey Management","page":928,"office":"Mines and Geosciences Bureau"},{"code":"MRO7","name":"Ore Reserves Inventory and Validation of Mining Projects","page":930,"office":"Mines and Geosciences Bureau"},{"code":"MRO8","name":"Assistance in the Operation of P/CMRB and Declaration of Minahang Bayan (MB) or People's Small-Scale Mining Area (PSSMA)","page":931,"office":"Mines and Geosciences Bureau"},{"code":"MRO9","name":"Assessment of Potential and Existing Mineral Reservation Areas","page":932,"office":"Mines and Geosciences Bureau"},{"code":"MRO10","name":"Quadrangle Geologic Mapping","page":933,"office":"Mines and Geosciences Bureau"},{"code":"MRO11","name":"Mineral Resources Assessment and Characterization","page":935,"office":"Mines and Geosciences Bureau"},{"code":"MRO12","name":"Geohazard and Engineering Geological Assessment","page":937,"office":"Mines and Geosciences Bureau"},{"code":"MRO13","name":"Hydrogeological Assessment","page":940,"office":"Mines and Geosciences Bureau"},{"code":"MRO14","name":"Digital Geologic Information and Database System Management","page":941,"office":"Mines and Geosciences Bureau"},{"code":"MRO15","name":"Laboratory Analyses and Services","page":942,"office":"Mines and Geosciences Bureau"},{"code":"MRO16","name":"Study on Small-Scale Mining and Quarrying Operations","page":944,"office":"Mines and Geosciences Bureau"},{"code":"MRO17","name":"Mine Safety and Health Management","page":945,"office":"Mines and Geosciences Bureau"},{"code":"MRO18","name":"Social/Community Development and Management","page":947,"office":"Mines and Geosciences Bureau"},{"code":"MRO19","name":"Mine Environmental Management","page":949,"office":"Mines and Geosciences Bureau"},{"code":"MRO20","name":"Planning, Programming and Monitoring","page":951,"office":"Mines and Geosciences Bureau"},{"code":"CC1","name":"Discipline","page":952,"office":"All Offices"},{"code":"CC2","name":"Excellence","page":954,"office":"All Offices"},{"code":"CC3","name":"Nobility","page":956,"office":"All Offices"},{"code":"CC4","name":"Responsibility","page":957,"office":"All Offices"},{"code":"CC5","name":"Caring for the Environment and Natural Resources","page":958,"office":"All Offices"},{"code":"OC1","name":"Writing Effectively","page":959,"office":"All Offices"},{"code":"OC2","name":"Speaking Effectively","page":960,"office":"All Offices"},{"code":"OC3","name":"Technology Literacy and Managing Information","page":962,"office":"All Offices"},{"code":"OC4","name":"Project Management","page":964,"office":"All Offices"},{"code":"OC5","name":"Completed Staff Work (CSW)","page":965,"office":"All Offices"},{"code":"LC1","name":"Strategic Leadership (Thinking Strategically and Creatively)","page":966,"office":"All Offices"},{"code":"LC2","name":"Leading Change","page":968,"office":"All Offices"},{"code":"LC3","name":"People Development (Creating and Nurturing a High Performing Organization)","page":970,"office":"All Offices"},{"code":"LC4","name":"People Performance Management (Managing Performance and Coaching for Results)","page":972,"office":"All Offices"},{"code":"LC5","name":"Partnership and Networking (Building Collaborative and Inclusive Working Relationships)","page":974,"office":"All Offices"}];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_BOUNDARIES = [192, 384, 589];
const LEVEL_NAMES = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';
const CODE_RE = /^([A-Z]+\d+[A-Z]?)\s*[-–]\s*(.+)/;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────────────────────

let _cache = null;
let _promise = null;

// ─────────────────────────────────────────────────────────────────────────────
// Column assignment
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_MARGIN = 6;

function getColumn(x) {
  for (let i = 0; i < COLUMN_BOUNDARIES.length; i++) {
    if (x < COLUMN_BOUNDARIES[i] + COLUMN_MARGIN) return i;
  }
  return 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row grouping
// ─────────────────────────────────────────────────────────────────────────────

function groupByRow(items, tol = 5) {
  const rows = new Map();
  for (const item of items) {
    let key = null;
    for (const k of rows.keys()) {
      if (Math.abs(k - item.y) <= tol) { key = k; break; }
    }
    key = key ?? item.y;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item);
  }
  const sorted = new Map([...rows.entries()].sort((a, b) => a[0] - b[0]));
  sorted.forEach(row => row.sort((a, b) => a.x - b.x));
  return sorted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page text extraction
// ─────────────────────────────────────────────────────────────────────────────

async function getPageItems(page) {
  const vp = page.getViewport({ scale: 1.0 });
  const content = await page.getTextContent();
  return content.items
    .filter(i => i.str && i.str.trim())
    .map(i => ({
      str: i.str,
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round((vp.height - i.transform[5]) * 10) / 10,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Header-row detection
// ─────────────────────────────────────────────────────────────────────────────

function findHeaderRow(rows) {
  for (const [y, items] of rows) {
    const texts = items.map(i => i.str.trim().toUpperCase());
    if (texts.includes('BASIC') && texts.includes('INTERMEDIATE')) return y;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Text cleanup helpers
// ─────────────────────────────────────────────────────────────────────────────

function stripLeadingOrphan(text) {
  return text.replace(/^[a-z] /, '');
}

function stripTrailingCode(text) {
  return text.replace(/\s+[A-Z]{1,5}\d+[A-Z]?\s*$/, '').trim();
}

function fixSpacing(text) {
  if (!text) return text;

  text = text.replace(/(\w+)\s+-\s+(\w+)/g, '$1-$2');

  const fixes = {
    'Deve lops': 'Develops',           'deve lops': 'develops',
    'st rategies': 'strategies',       'St rategies': 'Strategies',
    'pro cedures': 'procedures',       'Pro cedures': 'Procedures',
    'inte grates': 'integrates',       'Inte grates': 'Integrates',
    'inter ventions': 'interventions', 'Inter ventions': 'Interventions',
    'poli cies': 'policies',           'Poli cies': 'Policies',
    'guide lines': 'guidelines',       'Guide lines': 'Guidelines',
    'recom mends': 'recommends',       'Recom mends': 'Recommends',
    'th e': 'the',                     'Th e': 'The',
    'an d': 'and',                     'An d': 'And',
    'In fluences': 'Influences',       'in fluences': 'influences',
    'im prove': 'improve',             'Im prove': 'Improve',
    'im proving': 'improving',         'Im proving': 'Improving',
    'im provement': 'improvement',     'Im provement': 'Improvement',
    'com pliance': 'compliance',       'Com pliance': 'Compliance',
    'en vironment': 'environment',     'En vironment': 'Environment',
    'en vironmental': 'environmental', 'En vironmental': 'Environmental',
    'sus tainable': 'sustainable',     'Sus tainable': 'Sustainable',
    're silient': 'resilient',         'Re silient': 'Resilient',
    'bio diversity': 'biodiversity',   'Bio diversity': 'Biodiversity',
    'eco logy': 'ecology',             'Eco logy': 'Ecology',
    'con struction': 'construction',   'Con struction': 'Construction',
    'de velopment': 'development',     'De velopment': 'Development',
    'cur rent': 'current',             'Cur rent': 'Current',
    'curren t': 'current',             'Curren t': 'Current',
  };

  for (const [broken, fixed] of Object.entries(fixes)) {
    text = text.replace(
      new RegExp('\\b' + broken.replace(/\s/g, '\\s') + '\\b', 'g'),
      fixed
    );
  }

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column parser — behavioral indicator + KSA items
// ─────────────────────────────────────────────────────────────────────────────

function parseColumn(lines) {
  const processed = [];
  for (const line of lines) {
    let t = line.trim();
    if (!t) continue;
    t = stripLeadingOrphan(t);
    if (!t) continue;
    if (/^[A-Z]{1,5}\d+[A-Z]?$/.test(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (LEVEL_NAMES.includes(t.toUpperCase())) continue;
    processed.push(t);
  }

  const segments = [];

  for (const line of processed) {
    const embeddedMatch = line.match(/^(.+?)\s+(\d+)\.\s+(.+)$/);
    if (embeddedMatch) {
      const beforeNum = embeddedMatch[1].trim();
      const num = parseInt(embeddedMatch[2], 10);
      const afterNum = embeddedMatch[3].trim();
      const startsWithNum = /^\d+\./.test(beforeNum);
      if (!startsWithNum && beforeNum.length > 5) {
        if (beforeNum) segments.push({ type: 'bi', num: null, parts: [beforeNum] });
        segments.push({ type: 'item', num, parts: [afterNum] });
        continue;
      }
    }

    const numMatch = line.match(/^(\d+)\.\s*(.*)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const rest = numMatch[2].trim();
      segments.push({ type: 'item', num, parts: rest ? [rest] : [] });
      continue;
    }

    if (segments.length > 0 && segments[segments.length - 1].type === 'item') {
      segments[segments.length - 1].parts.push(line);
      continue;
    }

    if (segments.length === 0 || segments[segments.length - 1].type === 'bi') {
      if (segments.length === 0) segments.push({ type: 'bi', num: null, parts: [] });
      segments[segments.length - 1].parts.push(line);
    } else {
      segments[segments.length - 1].parts.push(line);
    }
  }

  const biParts = [];
  const items = [];

  for (const seg of segments) {
    if (seg.type === 'bi') {
      biParts.push(seg.parts.join(' '));
    } else {
      const raw = seg.parts.join(' ').trim();
      items.push(stripTrailingCode(`${seg.num}. ${raw}`));
    }
  }

  const behavioralIndicator = fixSpacing(biParts.join(' ').trim());
  const fixedItems = items
    .map(item => fixSpacing(item))
    .filter(item => item.replace(/^\d+\.\s*/, '').trim().length > 3);

  return { behavioralIndicator, items: fixedItems };
}

// ─────────────────────────────────────────────────────────────────────────────
// Level extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractLevels(rows, headerY, code) {
  const cols = [[], [], [], []];
  let past = false;

  for (const [y, items] of rows) {
    if (!past) {
      if (y >= headerY) past = true;
      else continue;
    }
    if (y === headerY) continue;

    const rowText = items.map(i => i.str).join(' ').trim();
    if (isSectionBreak(rowText)) break;
    if (/^\d+$/.test(rowText)) continue;

    const rowByCol = [[], [], [], []];
    for (const item of items) {
      const colIdx = getColumn(item.x);
      rowByCol[colIdx].push(item.str);
    }

    rowByCol.forEach((colItems, colIdx) => {
      if (colItems.length > 0) {
        const line = colItems.join(' ').trim();
        if (line) cols[colIdx].push(line);
      }
    });
  }

  const levels = {};
  LEVEL_NAMES.forEach((name, i) => {
    levels[name] = parseColumn(cols[i]);
  });

  return levels;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping (from TOC code prefix + office)
// ─────────────────────────────────────────────────────────────────────────────

function getCategoryFromTOC(tocEntry) {
  if (!tocEntry) return 'General Competencies';
  return tocEntry.office || 'General Competencies';
}

function isSectionBreak(text) {
  const sectionHeaders = [
    'ORGANIZATIONAL COMPETENCIES',
    'CORE COMPETENCIES',
    'LEADERSHIP COMPETENCIES',
    'MINIMUM COMPETENCIES',
    'BASIC COMPETENCIES',
    'TECHNICAL COMPETENCIES',
  ];
  const normalized = text.trim().toUpperCase();
  return sectionHeaders.some(header => normalized.includes(header));
}

// ─────────────────────────────────────────────────────────────────────────────
// TOC-based lookup: find entries by page number
// ─────────────────────────────────────────────────────────────────────────────

function getTOCByPage(page) {
  return TOC_INDEX.filter(e => e.page === page);
}

function getTOCByCode(code) {
  const upper = code.trim().toUpperCase();
  return TOC_INDEX.filter(e => e.code.toUpperCase() === upper);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF parsing pipeline — TOC-driven
// ─────────────────────────────────────────────────────────────────────────────

async function _parse(onProgress = () => {}) {
  onProgress(0, 'Loading PDF…');
  const pdf = await pdfjsLib.getDocument({ url: PDF_PATH }).promise;
  const total = pdf.numPages;
  onProgress(5, `${total} pages found…`);

  // Load all pages
  const allRows = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    allRows.push(groupByRow(await getPageItems(page)));
    if (p % 20 === 0 || p === total)
      onProgress(Math.round(5 + (p / total) * 55), `Page ${p}/${total}…`);
  }

  onProgress(62, 'Indexing via TOC…');

  // Build a location list from the main PDF's CODE_RE matches
  // (still needed for boundary detection between competencies)
  const pdfLocs = [];
  for (let pi = 0; pi < allRows.length; pi++) {
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      const m = CODE_RE.exec(line);
      if (m) pdfLocs.push({ pi, y, code: m[1].trim(), name: m[2].trim() });
    }
  }

  onProgress(70, `Found ${pdfLocs.length} competency headers. Extracting…`);

  console.log('=== Pages 161-166 raw text ===');
  for (let pi = 160; pi <= 165; pi++) {
    if (pi >= allRows.length) break;
    console.log(`\n--- pageIdx ${pi} (PDF page ${pi+1}) ---`);
    for (const [y, items] of allRows[pi]) {
      const line = items.map(i => i.str).join(' ').trim();
      console.log(`  y=${y}: "${line}"`);
    }
  }
  console.log('=== All pdfLocs with RSCI codes ===');
  console.log(JSON.stringify(pdfLocs.filter(l => l.code.startsWith('RSCI'))));

  // Build page index: TOC page → PDF page index (0-based)
  // The TOC page numbers are the page numbers printed IN the PDF
  // We need to map these to the actual 0-based array indices
  // Typically page 1 in the PDF = index 0, so PDF page N = index N-1
  // But some PDFs have front matter; we'll do an offset detection
  
  // Find offset: look for a page where the printed number matches array index+1
  // Simple heuristic: assume offset = 0 (page 1 = index 0)
  const PAGE_OFFSET = 0; // adjust if needed: pdfPage = tocPage - 1 + PAGE_OFFSET

  const result = [];

  // Process each TOC entry
  for (let ti = 0; ti < TOC_INDEX.length; ti++) {
    const tocEntry = TOC_INDEX[ti];
    const targetPageIdx = tocEntry.page - 1 + PAGE_OFFSET;

    if (targetPageIdx < 0 || targetPageIdx >= allRows.length) continue;

    // Find the exact row on this page for this competency
    // Strategy: look for a row with the code in it, starting at target page
    // Search ±2 pages for the code (PDF page numbers can be off by a few)
    let foundLoc = null;
    for (let delta = 0; delta <= 3; delta++) {
      for (const sign of [0, -1, 1, -2, 2]) {
        const pi = targetPageIdx + (delta * Math.sign(sign || 1)) * Math.abs(sign || 0);
        if (delta === 0 && sign !== 0) continue;
        if (delta > 0 && sign === 0) continue;
        const checkPi = pi;
        if (checkPi < 0 || checkPi >= allRows.length) continue;
        
        for (const [y, items] of allRows[checkPi]) {
          const line = items.map(i => i.str).join(' ').trim();
          const m = CODE_RE.exec(line);
          if (m && m[1].trim().toUpperCase() === tocEntry.code.toUpperCase()) {
            // Verify it's the right entry by checking name similarity if possible
            foundLoc = { pi: checkPi, y, code: m[1].trim(), name: m[2].trim() };
            break;
          }
        }
        if (foundLoc) break;
      }
      if (foundLoc) break;

      // Try searching in range around target page
      if (delta > 0) {
        for (const pi of [targetPageIdx - delta, targetPageIdx + delta]) {
          if (pi < 0 || pi >= allRows.length) continue;
          for (const [y, items] of allRows[pi]) {
            const line = items.map(i => i.str).join(' ').trim();
            const m = CODE_RE.exec(line);
            if (m && m[1].trim().toUpperCase() === tocEntry.code.toUpperCase()) {
              foundLoc = { pi, y, code: m[1].trim(), name: m[2].trim() };
              break;
            }
          }
          if (foundLoc) break;
        }
        if (foundLoc) break;
      }
    }

    if (!foundLoc) {
      // Try a broader search using pdfLocs
      const candidates = pdfLocs.filter(l => l.code.toUpperCase() === tocEntry.code.toUpperCase());
      if (candidates.length > 0) {
        // Pick the one closest to the expected page
        candidates.sort((a, b) => Math.abs(a.pi - targetPageIdx) - Math.abs(b.pi - targetPageIdx));
        foundLoc = candidates[0];
      }
    }

    if (!foundLoc) continue;

    if (tocEntry.code === 'RSCI6') {
      console.log('=== RSCI6 DEBUG ===');
      console.log('targetPageIdx:', targetPageIdx);
      console.log('foundLoc:', foundLoc);
      console.log('nextLoc:', nextLoc);
      
      // Check what's actually on pages around 163
      for (let pi = targetPageIdx - 1; pi <= targetPageIdx + 2; pi++) {
        if (pi < 0 || pi >= allRows.length) continue;
        console.log(`--- Page index ${pi} (PDF page ~${pi+1}) ---`);
        for (const [y, items] of allRows[pi]) {
          const line = items.map(i => i.str).join(' ').trim();
          if (line) console.log(`  y=${y}: "${line}"`);
        }
      }
    }

    // Find the next competency location to bound extraction
    // Use pdfLocs to find the next one after foundLoc
    const nextLocIdx = pdfLocs.findIndex(l =>
      (l.pi > foundLoc.pi) || (l.pi === foundLoc.pi && l.y > foundLoc.y + 30)
    );
    const nextLoc = nextLocIdx >= 0 ? pdfLocs[nextLocIdx] : null;

    // Extract section rows
    const section = new Map();
    let yOff = 0;

    for (let pi = foundLoc.pi; pi < allRows.length; pi++) {
      if (nextLoc && pi > nextLoc.pi) break;

      let maxY = 0;
      let shouldBreak = false;

      for (const [y, items] of allRows[pi]) {
        if (pi === foundLoc.pi && y < foundLoc.y) continue;
        if (pi === nextLoc?.pi && y >= nextLoc.y) continue;

        const rowText = items.map(i => i.str).join(' ').trim();
        if (isSectionBreak(rowText)) { shouldBreak = true; break; }

        section.set(y + yOff, items);
        maxY = Math.max(maxY, y);
      }

      if (shouldBreak) break;
      yOff += maxY + 50;
      //if (!nextLoc || pi < nextLoc.pi - 1) continue;
      //if (nextLoc && pi === nextLoc.pi - 1) break;
    }

    const headerY = findHeaderRow(section);
    if (!headerY) continue;

    const levels = extractLevels(section, headerY, tocEntry.code);
    const hasContent = LEVEL_NAMES.some(l =>
      levels[l].behavioralIndicator || levels[l].items.length > 0
    );

    if (tocEntry.code === 'RSCI6') {
      console.log('RSCI6 foundLoc:', foundLoc);
      console.log('RSCI6 nextLoc:', nextLoc);
      console.log('RSCI6 section size:', section.size);
      console.log('RSCI6 headerY:', findHeaderRow(section));
      console.log('RSCI6 levels:', JSON.stringify(levels));
    }
    if (!hasContent) continue;

    result.push({
      code:     tocEntry.code,
      name:     tocEntry.name,      // Use TOC name (authoritative)
      category: tocEntry.office,    // Use TOC office as category
      office:   tocEntry.office,
      page:     tocEntry.page,
      levels,
    });

    if (ti % 15 === 0)
      onProgress(Math.round(70 + (ti / TOC_INDEX.length) * 28), `Extracted ${ti + 1}…`);
  }

  onProgress(100, 'Done');
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Name-matching helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeName(name) {
  return name.toUpperCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s\/\-]/g, '')
    .trim();
}

const STOP_WORDS = new Set([
  'AND', 'THE', 'OF', 'FOR', 'TO', 'IN', 'ON', 'AT', 'BY', 'OR',
  'ITS', 'WITH', 'FROM', 'THAT', 'THIS', 'ARE', 'WAS', 'HAS',
  'THEIR', 'THEY', 'INTO', 'ALSO',
]);

function meaningfulWords(normalized) {
  return new Set(
    normalized.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

// Character trigram similarity — handles misspellings and single-word names
function trigramSimilarity(a, b) {
  const getTrigrams = str => {
    const s = str.toLowerCase().replace(/\s+/g, '');
    const trigrams = new Set();
    for (let i = 0; i < s.length - 2; i++) trigrams.add(s.slice(i, i + 3));
    return trigrams;
  };
  const ta = getTrigrams(a), tb = getTrigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const inter = [...ta].filter(t => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}

function nameSimilarity(a, b) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return 1.0;

  const aw = meaningfulWords(na);
  const bw = meaningfulWords(nb);

  let jaccard = 0;
  if (aw.size > 0 && bw.size > 0) {
    const inter = [...aw].filter(w => bw.has(w)).length;
    const union = new Set([...aw, ...bw]).size;
    jaccard = inter / union;

    const shorter = aw.size <= bw.size ? aw : bw;
    const longer  = aw.size <= bw.size ? bw : aw;
    const allContained = shorter.size >= 4 && [...shorter].every(w => longer.has(w));
    if (allContained) jaccard = Math.min(1.0, jaccard + 0.25);
  }

  // Trigram similarity catches misspellings and short single-word names
  const tg = trigramSimilarity(a, b);

  // For short/single-word names, weight trigrams more heavily
  const wordCount = Math.min(aw.size, bw.size);
  const trigramWeight = wordCount <= 1 ? 0.85 : 0.35;
  const jaccardWeight = 1 - trigramWeight;

  return Math.min(1.0, jaccard * jaccardWeight + tg * trigramWeight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function ensureParsed(onProgress) {
  if (_cache)   return _cache;
  if (_promise) return _promise;
  _promise = _parse(onProgress).then(r => { _cache = r; _promise = null; return r; });
  return _promise;
}

/**
 * Find competencies by name using TOC as primary lookup, PDF content as secondary.
 *
 * Strategy:
 * 1. TOC code match (if name contains a code like "RSCI6")
 * 2. TOC name exact/fuzzy match → gets the right page → loads from cache
 * 3. Fallback to full content search
 */
export async function findCompetenciesByName(name) {
  const comps = await ensureParsed();

  const rsci6 = comps.find(c => c.code === 'RSCI6');
  console.log('RSCI6 in cache:', rsci6);

  // Strip UI level-prefix decoration
  const cleanName = name.replace(/^\([A-Z]+\)\s*-\s*/i, '').trim();

  const SINGLE_THRESHOLD  = 0.50;
  const VARIANT_THRESHOLD = 0.85;

  const collectMatches = (searchName) => {
    return comps
      .map(c => ({ comp: c, score: nameSimilarity(searchName, c.name) }))
      .filter(({ score }) => score >= SINGLE_THRESHOLD)
      .sort((a, b) => b.score - a.score);
  };

  let scored = collectMatches(cleanName);

  // Fallback 1: strip parenthetical suffix
  if (scored.length === 0) {
    const fallbackName = cleanName.split('(')[0].trim();
    if (fallbackName !== cleanName && fallbackName.length > 10) {
      scored = collectMatches(fallbackName);
    }
  }

  // Fallback 2: substring matching
  if (scored.length === 0) {
    const normalized = normalizeName(cleanName);
    scored = comps
      .filter(c => {
        const cNorm = normalizeName(c.name);
        return cNorm.includes(normalized) || normalized.includes(cNorm);
      })
      .map(c => ({ comp: c, score: 0.55 }));
  }

  // Fallback 3: check TOC directly by name and return if found there but not in cache
  if (scored.length === 0) {
    const tocMatches = TOC_INDEX
      .map(e => ({ entry: e, score: nameSimilarity(cleanName, e.name) }))
      .filter(({ score }) => score >= 0.40)
      .sort((a, b) => b.score - a.score);
    
    // Return TOC metadata even without PDF content (graceful degradation)
    if (tocMatches.length > 0) {
      return tocMatches.slice(0, 3).map(({ entry }) => ({
        code:     entry.code,
        name:     entry.name,
        category: entry.office,
        office:   entry.office,
        page:     entry.page,
        levels: {
          BASIC:        { behavioralIndicator: '', items: [] },
          INTERMEDIATE: { behavioralIndicator: '', items: [] },
          ADVANCED:     { behavioralIndicator: '', items: [] },
          SUPERIOR:     { behavioralIndicator: '', items: [] },
        },
        _notExtracted: true,
      }));
    }
  }

  if (scored.length === 0) return [];

  const best = scored[0];
  const results = [best.comp];

  for (let i = 1; i < scored.length; i++) {
    const candidate = scored[i];
    if (candidate.score < VARIANT_THRESHOLD) break;

    const nameToName = nameSimilarity(best.comp.name, candidate.comp.name);
    if (nameToName >= VARIANT_THRESHOLD) {
      results.push(candidate.comp);
    }
  }

  return results;
}

/**
 * Legacy single-result wrapper.
 */
export async function findCompetencyByName(name) {
  const results = await findCompetenciesByName(name);
  return results[0] ?? null;
}

/**
 * Find a competency by its exact CBS code (e.g. "RO2", "PCO2", "RSCI6").
 * Returns ALL matches (same code can exist in different offices/pages).
 */
export async function findCompetencyByCode(code) {
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  const matches = comps.filter(c => c.code.toUpperCase() === upper);
  return matches[0] ?? null;
}

/**
 * Find ALL entries for a code (different offices may share codes).
 */
export async function findCompetenciesByCode(code) {
  const comps = await ensureParsed();
  const upper = code.trim().toUpperCase();
  return comps.filter(c => c.code.toUpperCase() === upper);
}

/**
 * Look up TOC metadata without loading the full PDF.
 * Fast, synchronous lookup.
 */
export function lookupTOC(codeOrName) {
  const upper = codeOrName.trim().toUpperCase();
  
  // Try code match first
  const byCode = TOC_INDEX.filter(e => e.code.toUpperCase() === upper);
  if (byCode.length > 0) return byCode;
  
  // Try name match
  const byName = TOC_INDEX
    .map(e => ({ entry: e, score: nameSimilarity(codeOrName, e.name) }))
    .filter(({ score }) => score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
  
  return byName;
}

/**
 * Get all TOC entries (for building the full index UI without loading PDF).
 */
export function getAllTOCEntries() {
  return TOC_INDEX;
}

/**
 * Get all competencies (for browsing the full manual).
 */
export async function getAllCompetencies() {
  return await ensureParsed();
}

export async function isPDFAvailable() {
  try {
    const r = await fetch(PDF_PATH, { method: 'HEAD' });
    return r.ok;
  } catch (e) {
    console.error('PDF fetch error:', e);
    return false;
  }
}
