import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─────────────────────────────────────────────────────────────────────────────
// TOC Index — parsed from TABLE_CONTENTS.pdf (513 entries)
// This is the ground truth for code → name → page → office mapping
// ─────────────────────────────────────────────────────────────────────────────

const TOC_INDEX = [
  // ── CENTRAL OFFICE ────────────────────────────────────────────────
  { code: "SCI4",   page: 22,  name: "Managing Corporate Identity and Brand",                                                                                          office: "Central Office" },
  { code: "SCI5",   page: 23,  name: "Managing Media Relations",                                                                                                       office: "Central Office" },
  { code: "SCI7",   page: 28,  name: "Managing Library and Information Resources to",                                                                                  office: "Central Office" },
  { code: "SCI8",   page: 30,  name: "Developing Partnerships to Support Priority Projects and Programs",                                                              office: "Central Office" },
  { code: "SCI9",   page: 31,  name: "Managing Events",                                                                                                                office: "Central Office" },
  { code: "SCI10",  page: 32,  name: "Managing Issues",                                                                                                                office: "Central Office" },
  { code: "SCI11",  page: 33,  name: "Managing Stakeholder Relations",                                                                                                 office: "Central Office" },
  { code: "SCI12",  page: 35,  name: "Adhering to Ethical Standards and Practices in SCIS Activities",                                                                office: "Central Office" },
  { code: "LA1",    page: 36,  name: "Skills in Legal Research",                                                                                                       office: "Central Office" },
  { code: "LA2",    page: 38,  name: "Management and Disposition of ENR Appealed Cases and other Legal Concerns",                                                     office: "Central Office" },
  { code: "LA3",    page: 40,  name: "Litigation",                                                                                                                     office: "Central Office" },
  { code: "LA4",    page: 41,  name: "Legal Counseling and Alternative Dispute Resolution",                                                                            office: "Central Office" },
  { code: "LA5",    page: 42,  name: "Investigation and Disposition of Administrative Complaints",                                                                     office: "Central Office" },
  { code: "S1",     page: 43,  name: "Legal Note Taking",                                                                                                              office: "Central Office" },
  { code: "S2",     page: 44,  name: "Legal Records Management",                                                                                                       office: "Central Office" },
  { code: "S3",     page: 46,  name: "Computerized Records Management",                                                                                                office: "Central Office" },
  { code: "S4",     page: 47,  name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Central Office" },
  { code: "AS1",    page: 49,  name: "Procurement Management",                                                                                                         office: "Central Office" },
  { code: "AS2",    page: 51,  name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "Central Office" },
  { code: "AS3",    page: 53,  name: "Records Management",                                                                                                             office: "Central Office" },
  { code: "AS4",    page: 54,  name: "Computerized Records Management",                                                                                                office: "Central Office" },
  { code: "AS5",    page: 55,  name: "Courier, Postal and Messengerial Services",                                                                                      office: "Central Office" },
  { code: "AS6",    page: 56,  name: "Clerical/ Secretarial/ Messengerial Services",                                                                                  office: "Central Office" },
  { code: "AS7",    page: 58,  name: "Building Maintenance System Administration",                                                                                     office: "Central Office" },
  { code: "AS8",    page: 59,  name: "Repair and Fabrication",                                                                                                         office: "Central Office" },
  { code: "AS9",    page: 60,  name: "Gardening and Landscaping",                                                                                                      office: "Central Office" },
  { code: "AS10",   page: 61,  name: "Radio Telecommunications Services",                                                                                             office: "Central Office" },
  { code: "AS11",   page: 62,  name: "Motorpool Services Management",                                                                                                  office: "Central Office" },
  { code: "AS12",   page: 63,  name: "Vehicle Repair and Maintenance",                                                                                                 office: "Central Office" },
  { code: "AS13",   page: 64,  name: "Cash Management",                                                                                                                office: "Central Office" },
  { code: "AS14",   page: 65,  name: "Hostel Administration",                                                                                                          office: "Central Office" },
  { code: "AS15",   page: 66,  name: "Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management",             office: "Central Office" },
  { code: "AS16",   page: 67,  name: "Customer Assistance and Request Handling",                                                                                       office: "Central Office" },
  { code: "HR1",    page: 68,  name: "Recruitment, Selection, and Placement",                                                                                          office: "Central Office" },
  { code: "HR2",    page: 70,  name: "Compensation, Benefits, and Welfare Administration",                                                                             office: "Central Office" },
  { code: "HR3",    page: 72,  name: "Processing of Personnel Actions",                                                                                                office: "Central Office" },
  { code: "HR4",    page: 73,  name: "Grievance Handling",                                                                                                             office: "Central Office" },
  { code: "HR5",    page: 74,  name: "Employee Counseling and Coaching",                                                                                               office: "Central Office" },
  { code: "HR6",    page: 75,  name: "Learning Needs Assessment (LNA)",                                                                                                office: "Central Office" },
  { code: "HR7",    page: 76,  name: "Preparation of Learning Design",                                                                                                 office: "Central Office" },
  { code: "HR8",    page: 77,  name: "Learning Program Management",                                                                                                    office: "Central Office" },
  { code: "HR9",    page: 78,  name: "Learning Event Facilitation",                                                                                                    office: "Central Office" },
  { code: "HR10",   page: 79,  name: "Networking and Linkaging with HR Partners",                                                                                     office: "Central Office" },
  { code: "HR11",   page: 80,  name: "Monitoring and Evaluation (M&E) of L&D Programs",                                                                              office: "Central Office" },
  { code: "HR12",   page: 81,  name: "Competency Development and Enhancement",                                                                                        office: "Central Office" },
  { code: "HR13",   page: 82,  name: "Scholarship Administration",                                                                                                     office: "Central Office" },
  { code: "HR14",   page: 84,  name: "HR Planning",                                                                                                                    office: "Central Office" },
  { code: "HR15",   page: 86,  name: "Career Development",                                                                                                             office: "Central Office" },
  { code: "HR16",   page: 88,  name: "Organization Development",                                                                                                       office: "Central Office" },
  { code: "IA1",    page: 89,  name: "Management Audit",                                                                                                               office: "Central Office" },
  { code: "IA2",    page: 91,  name: "Operations Audit",                                                                                                               office: "Central Office" },
  { code: "FM1",    page: 93,  name: "General Accounting",                                                                                                             office: "Central Office" },
  { code: "FM2",    page: 96,  name: "Budget Preparation and Legislation",                                                                                             office: "Central Office" },
  { code: "FM3",    page: 98,  name: "Budget Execution and Accountability",                                                                                            office: "Central Office" },
  { code: "FM4",    page: 100, name: "Organization and Management Systems Improvement",                                                                                office: "Central Office" },
  { code: "IS1",    page: 102, name: "Application Systems Development",                                                                                                office: "Central Office" },
  { code: "IS2",    page: 103, name: "Systems Analysis and Design",                                                                                                    office: "Central Office" },
  { code: "IS3",    page: 105, name: "Network Infrastructure Management",                                                                                              office: "Central Office" },
  { code: "IS4",    page: 106, name: "Network Systems Management",                                                                                                     office: "Central Office" },
  { code: "IS5",    page: 107, name: "Information and Communication Technologies (ICT) Planning and Resource Management",                                             office: "Central Office" },
  { code: "IS6",    page: 109, name: "Cyber Security and Information Security",                                                                                        office: "Central Office" },
  { code: "IS7",    page: 110, name: "Data Management and Publication of Knowledge Products",                                                                         office: "Central Office" },
  { code: "IS8",    page: 112, name: "Statistical Analysis and Production of Knowledge Products",                                                                      office: "Central Office" },
  { code: "IS9",    page: 113, name: "Spatial Analysis, Conversion of Statistical Data to Spatial Data, and Conversion to Knowledge Products",                       office: "Central Office" },
  { code: "PP1",    page: 115, name: "Planning and Programming",                                                                                                       office: "Central Office" },
  { code: "PP2",    page: 117, name: "Policy Analysis",                                                                                                                office: "Central Office" },
  { code: "PP3",    page: 118, name: "Monitoring and Evaluation of DENR Programs and Projects",                                                                       office: "Central Office" },
  { code: "FASP1",  page: 120, name: "Project Preparation and Design",                                                                                                 office: "Central Office" },
  { code: "FASP2",  page: 122, name: "Fund Sourcing and Resource Mobilization",                                                                                        office: "Central Office" },
  { code: "FASP3",  page: 124, name: "Project Operations Planning",                                                                                                    office: "Central Office" },
  { code: "FASP4",  page: 126, name: "Project Coordination, Facilitation, Progress Monitoring of Project Implementation",                                             office: "Central Office" },
  { code: "FASP5",  page: 128, name: "Project Monitoring and Evaluation",                                                                                              office: "Central Office" },
  { code: "FASP6",  page: 130, name: "Project Financial and Administrative Management",                                                                                office: "Central Office" },
  { code: "EE1",    page: 133, name: "Policy Research and Development on Ecological Solid Waste Management (ESWM)",                                                   office: "Central Office" },
  { code: "EE2",    page: 134, name: "Training and Information Dissemination on Ecological Solid Waste Management",                                                   office: "Central Office" },
  { code: "EE3",    page: 135, name: "Implementation of Programs and Projects on Ecological Solid Waste Management (ESWM)",                                          office: "Central Office" },
  { code: "EE4",    page: 136, name: "Solid Waste Monitoring and Assessment",                                                                                         office: "Central Office" },
  { code: "WQWM1",  page: 137, name: "Water Quality Management",                                                                                                       office: "Central Office" },
  { code: "WQWM2",  page: 138, name: "Monitoring and Evaluation of Compliance of Facilities or Establishments",                                                       office: "Central Office" },
  { code: "WQWM3",  page: 139, name: "Environmental Research Generation",                                                                                              office: "Central Office" },
  { code: "WQWM4",  page: 140, name: "Collection of Water Samples",                                                                                                    office: "Central Office" },
  { code: "WQWM5",  page: 141, name: "Collection of Environmental Data",                                                                                               office: "Central Office" },
  { code: "WQWM6",  page: 142, name: "Data Analysis and Interpretation",                                                                                               office: "Central Office" },
  { code: "WQWM7",  page: 143, name: "Documentation and Dissemination of Results",                                                                                    office: "Central Office" },
  { code: "WQWM8",  page: 144, name: "Equipment Maintenance and Calibration",                                                                                          office: "Central Office" },
  { code: "EP1",    page: 145, name: "Environmental Planning, Programming and Evaluation",                                                                             office: "Central Office" },
  { code: "EP2",    page: 147, name: "Project Monitoring",                                                                                                             office: "Central Office" },

  // ── REGIONAL OFFICES ──────────────────────────────────────────────
  { code: "RSCI1",  page: 153, name: "Media Relations Management",                                                                                                     office: "Regional Offices" },
  { code: "RSCI2",  page: 155, name: "Development Communication Management",                                                                                           office: "Regional Offices" },
  { code: "RSCI3",  page: 157, name: "Event Management",                                                                                                               office: "Regional Offices" },
  { code: "RSCI4",  page: 159, name: "Visual Communication (Graphic Design and Layout)",                                                                               office: "Regional Offices" },
  { code: "RSCI5",  page: 161, name: "Video Production",                                                                                                               office: "Regional Offices" },
  { code: "RSCI6",  page: 163, name: "Photojournalism",                                                                                                                office: "Regional Offices" },
  { code: "RSCI7",  page: 165, name: "Library Management",                                                                                                             office: "Regional Offices" },
  { code: "RP1",    page: 167, name: "Planning and Programming",                                                                                                       office: "Regional Offices" },
  { code: "RP2",    page: 169, name: "Monitoring and Evaluation",                                                                                                      office: "Regional Offices" },
  { code: "RP3",    page: 171, name: "Statistical Analysis, Data Management and Production of Knowledge Products",                                                    office: "Regional Offices" },
  { code: "RP4",    page: 173, name: "Organization and Management Systems Improvement",                                                                                office: "Regional Offices" },
  { code: "RIS1",   page: 175, name: "Statistical Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products",                    office: "Regional Offices" },
  { code: "RIS2",   page: 177, name: "Software Development",                                                                                                           office: "Regional Offices" },
  { code: "RIS3",   page: 178, name: "Network Infrastructure Management",                                                                                              office: "Regional Offices" },
  { code: "RIS4",   page: 179, name: "Systems Analysis and Design",                                                                                                    office: "Regional Offices" },
  { code: "RIS5",   page: 181, name: "Web Development",                                                                                                                office: "Regional Offices" },
  { code: "RIS6",   page: 183, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "Regional Offices" },
  { code: "RIS7",   page: 184, name: "Cyber Security and Information Security",                                                                                        office: "Regional Offices" },
  { code: "RFM1",   page: 185, name: "General Accounting",                                                                                                             office: "Regional Offices" },
  { code: "RFM2",   page: 187, name: "Budget Preparation",                                                                                                             office: "Regional Offices" },
  { code: "RFM3",   page: 188, name: "Budget Administration and Control",                                                                                              office: "Regional Offices" },
  { code: "RFM4",   page: 190, name: "Organization and Management Systems Improvement",                                                                                office: "Regional Offices" },
  { code: "RFM5",   page: 192, name: "Cash Management",                                                                                                                office: "Regional Offices" },
  { code: "RLA1",   page: 193, name: "Skills in Legal Research",                                                                                                       office: "Regional Offices" },
  { code: "RLA2",   page: 195, name: "Management and Disposition of ENR Cases and Other Legal Concerns",                                                              office: "Regional Offices" },
  { code: "RLA3",   page: 197, name: "Litigation",                                                                                                                     office: "Regional Offices" },
  { code: "RLA4",   page: 198, name: "Legal Counseling and Alternate Dispute Resolution (ADR)",                                                                       office: "Regional Offices" },
  { code: "RLA5",   page: 199, name: "Investigation and Disposition of Administrative Complaints",                                                                     office: "Regional Offices" },
  { code: "RS1",    page: 200, name: "Legal Note Taking",                                                                                                              office: "Regional Offices" },
  { code: "RS2",    page: 201, name: "Legal Records Management",                                                                                                       office: "Regional Offices" },
  { code: "RS3",    page: 203, name: "Computerized Records Management",                                                                                                office: "Regional Offices" },
  { code: "RS4",    page: 204, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Regional Offices" },
  { code: "RAS1",   page: 206, name: "Procurement Management",                                                                                                         office: "Regional Offices" },
  { code: "RAS2",   page: 208, name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "Regional Offices" },
  { code: "RAS3",   page: 209, name: "Records Management",                                                                                                             office: "Regional Offices" },
  { code: "RAS4",   page: 210, name: "Computerized Records Management",                                                                                                office: "Regional Offices" },
  { code: "RAS5",   page: 211, name: "Courier, Postal and Messengerial Services",                                                                                      office: "Regional Offices" },
  { code: "RAS6",   page: 212, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Regional Offices" },
  { code: "RAS7",   page: 214, name: "Building Maintenance System Administration",                                                                                     office: "Regional Offices" },
  { code: "RAS8",   page: 215, name: "Repair and Fabrication",                                                                                                         office: "Regional Offices" },
  { code: "RAS9",   page: 217, name: "Driving",                                                                                                                        office: "Regional Offices" },
  { code: "RAS10",  page: 219, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Regional Offices" },
  { code: "RAS11",  page: 220, name: "Motor Pool Services Management",                                                                                                 office: "Regional Offices" },
  { code: "RHR1",   page: 222, name: "Recruitment, Selection and Placement",                                                                                           office: "Regional Offices" },
  { code: "RHR2",   page: 224, name: "Compensation, Benefits and Welfare Administration",                                                                              office: "Regional Offices" },
  { code: "RHR3",   page: 226, name: "Processing of Personnel Actions",                                                                                                office: "Regional Offices" },
  { code: "RHR4",   page: 227, name: "Grievance Handling",                                                                                                             office: "Regional Offices" },
  { code: "RHR5",   page: 228, name: "Performance Management",                                                                                                         office: "Regional Offices" },
  { code: "RHR6",   page: 229, name: "Learning Needs Assessment (LNA)",                                                                                                office: "Regional Offices" },
  { code: "RHR7",   page: 230, name: "Preparation of Learning Design",                                                                                                 office: "Regional Offices" },
  { code: "RHR8",   page: 231, name: "Learning Event Management",                                                                                                      office: "Regional Offices" },
  { code: "RHR9",   page: 232, name: "Learning Event Facilitation",                                                                                                    office: "Regional Offices" },
  { code: "RHR10",  page: 234, name: "Network and Linkaging with HR Partners",                                                                                        office: "Regional Offices" },
  { code: "RHR11",  page: 235, name: "Monitoring and Evaluation (M&E) of Learning and Development (L&D) Program",                                                    office: "Regional Offices" },
  { code: "RHR12",  page: 236, name: "Scholarship Administration",                                                                                                     office: "Regional Offices" },
  { code: "RHR13",  page: 238, name: "HR Planning",                                                                                                                    office: "Regional Offices" },
  { code: "RHR14",  page: 240, name: "Career Development",                                                                                                             office: "Regional Offices" },
  { code: "RO1",    page: 242, name: "Concept and Application of Integrated Ecosystems Management (IEM)",                                                             office: "Regional Offices" },
  { code: "RO2",    page: 243, name: "Identification of Interventions and Integrating Strategies Across Sectors (Forestry, Coastal, Agriculture, Urban, Air Space) and Zoning for Strategic Management", office: "Regional Offices" },
  { code: "RO3",    page: 244, name: "Characterization of Ecosystem and Use of Planning Tools and Procedures",                                                        office: "Regional Offices" },
  { code: "RO4",    page: 245, name: "Resource Management and Restoration/ Rehabilitation of Degraded Ecosystems",                                                    office: "Regional Offices" },
  { code: "RO5",    page: 246, name: "Preparation of Natural Resources Management (NRM) - Related Plans FLUP, CRMP, ISWMP, PAMP, IRBM, IWRM",                       office: "Regional Offices" },
  { code: "RO6",    page: 247, name: "Environment and Natural Resource Accounting (ENRA)",                                                                             office: "Regional Offices" },
  { code: "RO7",    page: 248, name: "Strategies and Schemes for Financing Environmental Projects",                                                                    office: "Regional Offices" },
  { code: "RO8",    page: 249, name: "Results-Based Monitoring and Evaluation Systems (RBME) and Environmental Audit for Different ENRM Sites",                      office: "Regional Offices" },
  { code: "RO9",    page: 251, name: "Environmental Governance",                                                                                                       office: "Regional Offices" },
  { code: "RO10",   page: 252, name: "Climate Change and Environmental Management",                                                                                    office: "Regional Offices" },
  { code: "RO11",   page: 253, name: "Information, Education and Communication, Social Marketing and Extension Support",                                              office: "Regional Offices" },
  { code: "RO12",   page: 254, name: "Impact Assessment Across Ecosystems",                                                                                            office: "Regional Offices" },
  { code: "RO13",   page: 255, name: "Social Negotiation",                                                                                                             office: "Regional Offices" },
  { code: "RO14",   page: 256, name: "ENR Law Enforcement",                                                                                                            office: "Regional Offices" },
  { code: "RO15",   page: 258, name: "Geographic Information System (GIS)",                                                                                            office: "Regional Offices" },
  { code: "RO16",   page: 259, name: "Surveying",                                                                                                                      office: "Regional Offices" },
  { code: "RO17",   page: 261, name: "Survey Verification",                                                                                                            office: "Regional Offices" },
  { code: "RO18",   page: 262, name: "Mapping",                                                                                                                        office: "Regional Offices" },
  { code: "RO19",   page: 264, name: "Land Management Information System Administration",                                                                              office: "Regional Offices" },
  { code: "RO20",   page: 265, name: "Land Records Management",                                                                                                        office: "Regional Offices" },
  { code: "RO21",   page: 267, name: "Land Disposition and Management",                                                                                                office: "Regional Offices" },
  { code: "RO22",   page: 268, name: "Forest, Water, and Wildlife Resource Regulation",                                                                                office: "Regional Offices" },
  { code: "RO23",   page: 269, name: "Tenure and Rights Assessment",                                                                                                   office: "Regional Offices" },
  { code: "RO24",   page: 270, name: "Tenurial Instruments and Permits for Improved Resource Management",                                                             office: "Regional Offices" },
  { code: "PO1",    page: 271, name: "Protected Area Management",                                                                                                      office: "Regional Offices" },
  { code: "PO2",    page: 272, name: "Management of Socio-Economics and Cultural Concerns",                                                                            office: "Regional Offices" },
  { code: "PO3",    page: 273, name: "Conservation and Management of Wildlife Species and their Habitats",                                                            office: "Regional Offices" },
  { code: "PO4",    page: 276, name: "Ecotourism Development and Management",                                                                                          office: "Regional Offices" },
  { code: "PO5",    page: 278, name: "Natural Resources Assessment - Biological & Physical",                                                                           office: "Regional Offices" },
  { code: "PO6",    page: 279, name: "Protected Area/ Critical Habitat Policy, Planning, and Management",                                                             office: "Regional Offices" },
  { code: "PO7",    page: 280, name: "Implementation of Protected Area Policies",                                                                                      office: "Regional Offices" },
  { code: "PO8",    page: 281, name: "Protected Area, Critical Habitat, Caves and Wildlife Law Enforcement",                                                          office: "Regional Offices" },

  // ── P/CENRO ───────────────────────────────────────────────────────
  { code: "PCP1",   page: 283, name: "Planning and Programming",                                                                                                       office: "P/CENRO" },
  { code: "PCP2",   page: 285, name: "Monitoring and Evaluation",                                                                                                      office: "P/CENRO" },
  { code: "PCP3",   page: 286, name: "Statistical Coordination and Data Research",                                                                                     office: "P/CENRO" },
  { code: "PCIS1",  page: 288, name: "Web Development",                                                                                                                office: "P/CENRO" },
  { code: "PCIS2",  page: 290, name: "Network Systems Management",                                                                                                     office: "P/CENRO" },
  { code: "PCIS3",  page: 291, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "P/CENRO" },
  { code: "PCFM1",  page: 292, name: "General Accounting",                                                                                                             office: "P/CENRO" },
  { code: "PCFM2",  page: 294, name: "Budget Preparation",                                                                                                             office: "P/CENRO" },
  { code: "PCFM3",  page: 295, name: "Budget Administration and Control",                                                                                              office: "P/CENRO" },
  { code: "PCFM4",  page: 297, name: "Cash Management",                                                                                                                office: "P/CENRO" },
  { code: "PCAS1",  page: 298, name: "Procurement Management",                                                                                                         office: "P/CENRO" },
  { code: "PCAS2",  page: 300, name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "P/CENRO" },
  { code: "PCAS3",  page: 302, name: "Records Management",                                                                                                             office: "P/CENRO" },
  { code: "PCAS4",  page: 304, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "P/CENRO" },
  { code: "PCAS5",  page: 306, name: "Infrastructure Maintenance System Administration",                                                                               office: "P/CENRO" },
  { code: "PCAS6",  page: 308, name: "Vehicle Repair and Maintenance",                                                                                                 office: "P/CENRO" },
  { code: "PCAS7",  page: 309, name: "EMS, Wellness, Security, Safety and Emergency Preparedness",                                                                    office: "P/CENRO" },
  { code: "PCAS8",  page: 310, name: "Customer Assistance and Request Handling",                                                                                       office: "P/CENRO" },
  { code: "PCAS9",  page: 311, name: "Repair and Fabrication",                                                                                                         office: "P/CENRO" },
  { code: "PCAS10", page: 313, name: "Establishment and Maintenance of Forest Nurseries",                                                                              office: "P/CENRO" },
  { code: "PCHR1",  page: 314, name: "Recruitment, Selection and Placement",                                                                                           office: "P/CENRO" },
  { code: "PCHR2",  page: 316, name: "Compensation, Benefits and Welfare Administration",                                                                              office: "P/CENRO" },
  { code: "PCHR3",  page: 318, name: "Processing of Personnel Actions",                                                                                                office: "P/CENRO" },
  { code: "PCHR4",  page: 319, name: "Grievance Handling",                                                                                                             office: "P/CENRO" },
  { code: "PCHR5",  page: 320, name: "Performance Management",                                                                                                         office: "P/CENRO" },
  { code: "PCHR6",  page: 321, name: "Learning Needs Assessment",                                                                                                      office: "P/CENRO" },
  { code: "PCHR7",  page: 322, name: "Career Development",                                                                                                             office: "P/CENRO" },
  { code: "PCO1",   page: 324, name: "Concept and Application of Integrated Ecosystems Management (IEM)",                                                             office: "P/CENRO" },
  { code: "PCO2",   page: 325, name: "Identification of Interventions and Integrating Strategies Across Sectors (Forestry, Agriculture, Urban, Air Space) and Zoning for Strategic Management", office: "P/CENRO" },
  { code: "PCO3",   page: 326, name: "Characterization of Ecosystems and Use of Planning Tools and Procedures",                                                       office: "P/CENRO" },
  { code: "PCO4",   page: 327, name: "Resource Management and Restoration/ rehabilitation of Degraded Ecosystems",                                                    office: "P/CENRO" },
  { code: "PCO5",   page: 328, name: "Preparation of Natural Resources Management (NRM)-Related Plans (FLUP, CRMP, ISWMP, IRBM, IWRM)",                             office: "P/CENRO" },
  { code: "PCO6",   page: 329, name: "Environment and Natural Resource (ENR) Accounting",                                                                             office: "P/CENRO" },
  { code: "PCO7",   page: 330, name: "Strategies and Schemes for Financing Environmental Projects",                                                                    office: "P/CENRO" },
  { code: "PCO8",   page: 331, name: "Results-Based Monitoring and Evaluation System (RBME) and Environmental Audit for Different ENRM Sites",                       office: "P/CENRO" },
  { code: "PCO9",   page: 333, name: "Environmental Governance",                                                                                                       office: "P/CENRO" },
  { code: "PCO10",  page: 334, name: "Climate Change and Environmental Management",                                                                                    office: "P/CENRO" },
  { code: "PCO11",  page: 335, name: "Information, Education and Communication, Social Marketing and Extension Support",                                              office: "P/CENRO" },
  { code: "PCO12",  page: 336, name: "Social Negotiation",                                                                                                             office: "P/CENRO" },
  { code: "PCO13",  page: 337, name: "ENR Law Enforcement",                                                                                                            office: "P/CENRO" },
  { code: "PCO14",  page: 339, name: "Land Disposition and Management",                                                                                                office: "P/CENRO" },
  { code: "PCO15",  page: 340, name: "Forest, Water and Wildfire Resources Regulation",                                                                                office: "P/CENRO" },
  { code: "PCO16",  page: 341, name: "Tenure and Rights Assessment",                                                                                                   office: "P/CENRO" },
  { code: "PCO17",  page: 342, name: "Tenurial Instruments and Permits for Improved Resource Management",                                                             office: "P/CENRO" },
  { code: "PCO18",  page: 343, name: "Geographic Information System (GIS)",                                                                                            office: "P/CENRO" },
  { code: "PCO19",  page: 344, name: "Surveying",                                                                                                                      office: "P/CENRO" },
  { code: "PCO20",  page: 346, name: "Survey Verification",                                                                                                            office: "P/CENRO" },
  { code: "PCO21",  page: 347, name: "Mapping",                                                                                                                        office: "P/CENRO" },
  { code: "PCO22",  page: 349, name: "Land Management Information System Administration",                                                                              office: "P/CENRO" },
  { code: "PCO23",  page: 350, name: "Land Records Management",                                                                                                        office: "P/CENRO" },
  { code: "PCO24",  page: 352, name: "Forest Resource Inventory and Assessment",                                                                                       office: "P/CENRO" },
  { code: "PCO25",  page: 353, name: "Scaling, Grading and Assessment of Forest Products",                                                                             office: "P/CENRO" },

  // ── BIODIVERSITY MANAGEMENT BUREAU ────────────────────────────────
  { code: "BFM1",   page: 354, name: "General Accounting",                                                                                                             office: "Biodiversity Management Bureau" },
  { code: "BFM2",   page: 356, name: "Budget Preparation",                                                                                                             office: "Biodiversity Management Bureau" },
  { code: "BFM3",   page: 357, name: "Budget Administration and Control",                                                                                              office: "Biodiversity Management Bureau" },
  { code: "BHR1",   page: 359, name: "Recruitment, Selection and Placement",                                                                                           office: "Biodiversity Management Bureau" },
  { code: "BHR2",   page: 361, name: "Compensation, Benefits and Welfare Administration",                                                                              office: "Biodiversity Management Bureau" },
  { code: "BHR3",   page: 363, name: "Processing of Personnel Actions",                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BHR4",   page: 364, name: "Grievance Handling",                                                                                                             office: "Biodiversity Management Bureau" },
  { code: "BHR5",   page: 365, name: "Learning Needs Assessment (LNA)",                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BHR6",   page: 366, name: "Preparation of Learning Design",                                                                                                 office: "Biodiversity Management Bureau" },
  { code: "BHR7",   page: 367, name: "Learning Program Management",                                                                                                    office: "Biodiversity Management Bureau" },
  { code: "BHR8",   page: 368, name: "Learning Event Facilitation",                                                                                                    office: "Biodiversity Management Bureau" },
  { code: "BHR9",   page: 369, name: "Networking and Linkaging with HR Partners",                                                                                     office: "Biodiversity Management Bureau" },
  { code: "BHR10",  page: 370, name: "Monitoring and Evaluation (M&E) of L&D Programs",                                                                              office: "Biodiversity Management Bureau" },
  { code: "BHR11",  page: 371, name: "Scholarship Administration",                                                                                                     office: "Biodiversity Management Bureau" },
  { code: "BHR12",  page: 372, name: "HR Planning",                                                                                                                    office: "Biodiversity Management Bureau" },
  { code: "BHR13",  page: 374, name: "Career Development",                                                                                                             office: "Biodiversity Management Bureau" },
  { code: "BA1",    page: 375, name: "Procurement Management",                                                                                                         office: "Biodiversity Management Bureau" },
  { code: "BA2",    page: 376, name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "Biodiversity Management Bureau" },
  { code: "BA3",    page: 378, name: "Records Management",                                                                                                             office: "Biodiversity Management Bureau" },
  { code: "BA4",    page: 379, name: "Computerized Records Management",                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BA5",    page: 380, name: "Courier, Postal and Messengerial Services",                                                                                      office: "Biodiversity Management Bureau" },
  { code: "BA6",    page: 381, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Biodiversity Management Bureau" },
  { code: "BA7",    page: 383, name: "Building Maintenance System Administration",                                                                                     office: "Biodiversity Management Bureau" },
  { code: "BA8",    page: 384, name: "Repair and Fabrication",                                                                                                         office: "Biodiversity Management Bureau" },
  { code: "BA9",    page: 385, name: "Gardening and Landscaping",                                                                                                      office: "Biodiversity Management Bureau" },
  { code: "BA10",   page: 386, name: "Motor Pool Services Management",                                                                                                 office: "Biodiversity Management Bureau" },
  { code: "BA11",   page: 388, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Biodiversity Management Bureau" },
  { code: "BA12",   page: 389, name: "Cash Management",                                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BA13",   page: 390, name: "Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management",             office: "Biodiversity Management Bureau" },
  { code: "BA14",   page: 391, name: "Customer Assistance and Request Handling",                                                                                       office: "Biodiversity Management Bureau" },
  { code: "BL1",    page: 392, name: "Skills in Legal Research",                                                                                                       office: "Biodiversity Management Bureau" },
  { code: "BL2",    page: 394, name: "Management and Disposition of ENR Appealed Cases and Other Legal Concerns",                                                     office: "Biodiversity Management Bureau" },
  { code: "BL3",    page: 396, name: "Litigation",                                                                                                                     office: "Biodiversity Management Bureau" },
  { code: "BL4",    page: 397, name: "Legal Counseling and Alternative Dispute Resolution",                                                                            office: "Biodiversity Management Bureau" },
  { code: "BL5",    page: 398, name: "Investigation and Disposition of Administrative Complaints",                                                                     office: "Biodiversity Management Bureau" },
  { code: "BP1",    page: 399, name: "Planning and Programming",                                                                                                       office: "Biodiversity Management Bureau" },
  { code: "BP2",    page: 401, name: "Policy Analysis",                                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BP3",    page: 402, name: "Monitoring and Evaluation of BPKMD Programs and Projects",                                                                      office: "Biodiversity Management Bureau" },
  { code: "BP4",    page: 404, name: "Managing Media Relations",                                                                                                       office: "Biodiversity Management Bureau" },
  { code: "BIS1",   page: 405, name: "Software Development",                                                                                                           office: "Biodiversity Management Bureau" },
  { code: "BIS2",   page: 406, name: "Systems Analysis and Design",                                                                                                    office: "Biodiversity Management Bureau" },
  { code: "BIS3",   page: 408, name: "Web Development",                                                                                                                office: "Biodiversity Management Bureau" },
  { code: "BIS4",   page: 410, name: "Network Infrastructure Management",                                                                                              office: "Biodiversity Management Bureau" },
  { code: "BIS5",   page: 411, name: "Network Systems Management",                                                                                                     office: "Biodiversity Management Bureau" },
  { code: "BIS6",   page: 412, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "Biodiversity Management Bureau" },
  { code: "BIS7",   page: 413, name: "Statistical Analysis, Data Management and Production of Knowledge Products",                                                    office: "Biodiversity Management Bureau" },
  { code: "BIS8",   page: 415, name: "Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products",                        office: "Biodiversity Management Bureau" },
  { code: "B1",     page: 416, name: "Caves, Wetlands and Other Ecosystems Resources Management",                                                                     office: "Biodiversity Management Bureau" },
  { code: "B2",     page: 417, name: "Protected Area Management",                                                                                                      office: "Biodiversity Management Bureau" },
  { code: "B3",     page: 420, name: "Management of Socio-Economics and Cultural Concerns",                                                                            office: "Biodiversity Management Bureau" },
  { code: "B4",     page: 421, name: "Coastal and Marine Biodiversity Management",                                                                                     office: "Biodiversity Management Bureau" },
  { code: "B5",     page: 425, name: "Coastal Hazard Management",                                                                                                      office: "Biodiversity Management Bureau" },
  { code: "B6",     page: 426, name: "Conservation and Management of Wildlife Resources",                                                                              office: "Biodiversity Management Bureau" },
  { code: "B7",     page: 429, name: "Care and Management of Captive Wildlife (ex-siu)",                                                                               office: "Biodiversity Management Bureau" },
  { code: "B8",     page: 431, name: "Ecotourism Development and Management",                                                                                          office: "Biodiversity Management Bureau" },
  { code: "B9",     page: 433, name: "Natural Resources Assessment - Biological and Physical",                                                                         office: "Biodiversity Management Bureau" },
  { code: "B10",    page: 434, name: "Monitoring and Implementation of Protected Area Policies",                                                                       office: "Biodiversity Management Bureau" },
  { code: "B11",    page: 435, name: "Protected Area, Critical Habitat, Caves, and Wildlife Law Enforcement",                                                         office: "Biodiversity Management Bureau" },
  { code: "B12",    page: 437, name: "Promotion of Biodiversity-Based Products Through Communication, Education, and Public Awareness (CEPA) Activities",            office: "Biodiversity Management Bureau" },

  // ── ECOSYSTEMS RESEARCH AND DEVELOPMENT BUREAU ────────────────────
  { code: "BFM1",   page: 439, name: "General Accounting",                                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BFM2",   page: 441, name: "Budget Preparation",                                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BFM3",   page: 442, name: "Budget Administration and Control",                                                                                              office: "Ecosystems Research and Development Bureau" },
  { code: "BFM4",   page: 444, name: "Organizational and Management Systems Improvement",                                                                              office: "Ecosystems Research and Development Bureau" },
  { code: "BHR1",   page: 446, name: "Recruitment, Selection, and Placement",                                                                                          office: "Ecosystems Research and Development Bureau" },
  { code: "BHR2",   page: 448, name: "Compensation, Benefits, and Welfare Administration",                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BHR3",   page: 450, name: "Processing of Personnel Actions",                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BHR4",   page: 451, name: "Grievance Handling",                                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BHR5",   page: 452, name: "Learning Needs Assessment (LNA)",                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BHR6",   page: 453, name: "Preparation of Learning Design",                                                                                                 office: "Ecosystems Research and Development Bureau" },
  { code: "BHR7",   page: 454, name: "Learning Program Management",                                                                                                    office: "Ecosystems Research and Development Bureau" },
  { code: "BHR8",   page: 455, name: "Learning Event Facilitation",                                                                                                    office: "Ecosystems Research and Development Bureau" },
  { code: "BHR9",   page: 456, name: "Networking and Linkaging with HR Partners",                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BHR10",  page: 457, name: "Monitoring and Evaluation (M&E) of L&D Programs",                                                                              office: "Ecosystems Research and Development Bureau" },
  { code: "BHR11",  page: 458, name: "Scholarship Administration",                                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BHR12",  page: 459, name: "HR Planning",                                                                                                                    office: "Ecosystems Research and Development Bureau" },
  { code: "BHR13",  page: 461, name: "Career Development",                                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BA1",    page: 462, name: "Procurement Management",                                                                                                         office: "Ecosystems Research and Development Bureau" },
  { code: "BA2",    page: 463, name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "Ecosystems Research and Development Bureau" },
  { code: "BA3",    page: 465, name: "Records Management",                                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BA4",    page: 466, name: "Computerized Records Management",                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BA5",    page: 467, name: "Courier, Postal, and Messengerial Services",                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BA6",    page: 468, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "BA7",    page: 470, name: "Building Maintenance System Administration",                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BA8",    page: 471, name: "Repair and Fabrication",                                                                                                         office: "Ecosystems Research and Development Bureau" },
  { code: "BA9",    page: 472, name: "Gardening and Landscaping",                                                                                                      office: "Ecosystems Research and Development Bureau" },
  { code: "BA10",   page: 473, name: "Motor Pool Services Management",                                                                                                 office: "Ecosystems Research and Development Bureau" },
  { code: "BA11",   page: 475, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Ecosystems Research and Development Bureau" },
  { code: "BA12",   page: 476, name: "Cash Management",                                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BA13",   page: 477, name: "Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management",             office: "Ecosystems Research and Development Bureau" },
  { code: "BA14",   page: 478, name: "Customer Assistance and Request Handling",                                                                                       office: "Ecosystems Research and Development Bureau" },
  { code: "BA15",   page: 479, name: "Driving",                                                                                                                        office: "Ecosystems Research and Development Bureau" },
  { code: "BA16",   page: 481, name: "Building Maintenance System Administration",                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BA17",   page: 482, name: "Basic Accounting and Cash Management",                                                                                           office: "Ecosystems Research and Development Bureau" },
  { code: "BA18",   page: 484, name: "Procurement Management",                                                                                                         office: "Ecosystems Research and Development Bureau" },
  { code: "BA19",   page: 486, name: "Property and Supply Management",                                                                                                 office: "Ecosystems Research and Development Bureau" },
  { code: "BL1",    page: 488, name: "Skills in Legal Research",                                                                                                       office: "Ecosystems Research and Development Bureau" },
  { code: "BL2",    page: 490, name: "Management and Disposition of ENR Appealed Cases and other Legal Concerns",                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BL3",    page: 492, name: "Litigation",                                                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BL4",    page: 493, name: "Legal Counselling and Alternative Dispute Resolution",                                                                           office: "Ecosystems Research and Development Bureau" },
  { code: "BL5",    page: 494, name: "Investigation and Disposition of Administrative Complaints",                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BP1",    page: 495, name: "Planning and Programming",                                                                                                       office: "Ecosystems Research and Development Bureau" },
  { code: "BP2",    page: 497, name: "Policy Analysis",                                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BP3",    page: 498, name: "Monitoring and Evaluation of DENR Programs and Projects",                                                                       office: "Ecosystems Research and Development Bureau" },
  { code: "BIS1",   page: 500, name: "Application Systems Development",                                                                                                office: "Ecosystems Research and Development Bureau" },
  { code: "BIS2",   page: 501, name: "Systems Analysis and Design",                                                                                                    office: "Ecosystems Research and Development Bureau" },
  { code: "BIS3",   page: 503, name: "Network Infrastructure Management",                                                                                              office: "Ecosystems Research and Development Bureau" },
  { code: "BIS4",   page: 504, name: "Network Systems Management",                                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "BIS5",   page: 505, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "Ecosystems Research and Development Bureau" },
  { code: "BIS6",   page: 506, name: "Statistical Analysis, Data Management and Production of Knowledge Products",                                                    office: "Ecosystems Research and Development Bureau" },
  { code: "BIS7",   page: 508, name: "Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products",                        office: "Ecosystems Research and Development Bureau" },
  { code: "R1",     page: 510, name: "Technology Generation",                                                                                                          office: "Ecosystems Research and Development Bureau" },
  { code: "R2",     page: 512, name: "Monitoring, Evaluation and Clearing House of Research, Development and Extension (RDE) Projects/ Activities",                  office: "Ecosystems Research and Development Bureau" },
  { code: "R3",     page: 513, name: "Technology Assessment and Packaging",                                                                                            office: "Ecosystems Research and Development Bureau" },
  { code: "R4",     page: 514, name: "Technology Promotion and Extension",                                                                                             office: "Ecosystems Research and Development Bureau" },
  { code: "R5",     page: 516, name: "Laboratory Management",                                                                                                          office: "Ecosystems Research and Development Bureau" },
  { code: "R6",     page: 517, name: "Demonstration and Experimental Forests/sites Management",                                                                       office: "Ecosystems Research and Development Bureau" },
  { code: "R7",     page: 518, name: "Managing Library and Information Resources",                                                                                     office: "Ecosystems Research and Development Bureau" },
  { code: "R8",     page: 520, name: "Forest Plantation Establishments, Maintenance and Protection",                                                                   office: "Ecosystems Research and Development Bureau" },

  // ── FOREST MANAGEMENT BUREAU ──────────────────────────────────────
  { code: "BFM1",   page: 521, name: "General Accounting",                                                                                                             office: "Forest Management Bureau" },
  { code: "BFM2",   page: 523, name: "Budget Preparation",                                                                                                             office: "Forest Management Bureau" },
  { code: "BFM3",   page: 524, name: "Budget Administration and Control",                                                                                              office: "Forest Management Bureau" },
  { code: "BHR1",   page: 526, name: "Recruitment, Selection, and Placement",                                                                                          office: "Forest Management Bureau" },
  { code: "BHR2",   page: 528, name: "Compensation, Benefits, and Welfare Administration",                                                                             office: "Forest Management Bureau" },
  { code: "BHR3",   page: 530, name: "Processing of Personnel Actions",                                                                                                office: "Forest Management Bureau" },
  { code: "BHR4",   page: 531, name: "Grievance Handling",                                                                                                             office: "Forest Management Bureau" },
  { code: "BHR5",   page: 532, name: "Learning Needs Assessment (LNA)",                                                                                                office: "Forest Management Bureau" },
  { code: "BHR6",   page: 533, name: "Preparation of Learning Design",                                                                                                 office: "Forest Management Bureau" },
  { code: "BHR7",   page: 534, name: "Learning Program Management",                                                                                                    office: "Forest Management Bureau" },
  { code: "BHR8",   page: 535, name: "Learning Event Facilitation",                                                                                                    office: "Forest Management Bureau" },
  { code: "BHR9",   page: 536, name: "Networking and Linkaging with HR Partners",                                                                                     office: "Forest Management Bureau" },
  { code: "BHR10",  page: 537, name: "Monitoring and Evaluation (M&E) of L&D Programs",                                                                              office: "Forest Management Bureau" },
  { code: "BHR11",  page: 538, name: "Scholarship Administration",                                                                                                     office: "Forest Management Bureau" },
  { code: "BHR12",  page: 539, name: "HR Planning",                                                                                                                    office: "Forest Management Bureau" },
  { code: "BHR13",  page: 541, name: "Career Development",                                                                                                             office: "Forest Management Bureau" },
  { code: "BA1",    page: 542, name: "Procurement Management",                                                                                                         office: "Forest Management Bureau" },
  { code: "BA2",    page: 543, name: "Property Management(Property Inventory and Disposal Management)",                                                                office: "Forest Management Bureau" },
  { code: "BA3",    page: 545, name: "Records Management",                                                                                                             office: "Forest Management Bureau" },
  { code: "BA4",    page: 546, name: "Computerized Records Management",                                                                                                office: "Forest Management Bureau" },
  { code: "BA5",    page: 547, name: "Courier, Postal, and Messengerial Services",                                                                                     office: "Forest Management Bureau" },
  { code: "BA6",    page: 548, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Forest Management Bureau" },
  { code: "BA7",    page: 550, name: "Building Maintenance System Administration",                                                                                     office: "Forest Management Bureau" },
  { code: "BA8",    page: 551, name: "Repair and Fabrication",                                                                                                         office: "Forest Management Bureau" },
  { code: "BA9",    page: 552, name: "Gardening and Landscaping",                                                                                                      office: "Forest Management Bureau" },
  { code: "BA10",   page: 553, name: "Motor Pool Services Management",                                                                                                 office: "Forest Management Bureau" },
  { code: "BA11",   page: 555, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Forest Management Bureau" },
  { code: "BA12",   page: 556, name: "Cash Management",                                                                                                                office: "Forest Management Bureau" },
  { code: "BA13",   page: 557, name: "Environmental Management System (EMS), Wellness, Security, Safety, Emergency Preparedness and Disaster Management",             office: "Forest Management Bureau" },
  { code: "BA14",   page: 558, name: "Customer Assistance and Request Handling",                                                                                       office: "Forest Management Bureau" },
  { code: "BL1",    page: 559, name: "Skills in Legal Research",                                                                                                       office: "Forest Management Bureau" },
  { code: "BL2",    page: 561, name: "Management and Disposition of ENR Appealed Cases and Other Legal Concerns",                                                     office: "Forest Management Bureau" },
  { code: "BL3",    page: 563, name: "Litigation",                                                                                                                     office: "Forest Management Bureau" },
  { code: "BL4",    page: 564, name: "Legal Counseling and Alternative Dispute Resolution",                                                                            office: "Forest Management Bureau" },
  { code: "BL5",    page: 565, name: "Investigation and Disposition of Administrative Complaints",                                                                     office: "Forest Management Bureau" },
  { code: "BP1",    page: 566, name: "Planning and Programming",                                                                                                       office: "Forest Management Bureau" },
  { code: "BP2",    page: 568, name: "Policy Analysis",                                                                                                                office: "Forest Management Bureau" },
  { code: "BP3",    page: 569, name: "Monitoring and Evaluation of DENR Programs and Projects",                                                                       office: "Forest Management Bureau" },
  { code: "BIS1",   page: 571, name: "Application Systems Development",                                                                                                office: "Forest Management Bureau" },
  { code: "BIS2",   page: 572, name: "System Analysis and Design",                                                                                                     office: "Forest Management Bureau" },
  { code: "BIS3",   page: 574, name: "Network Infrastructure Management",                                                                                              office: "Forest Management Bureau" },
  { code: "BIS4",   page: 575, name: "Network Systems Management",                                                                                                     office: "Forest Management Bureau" },
  { code: "BIS5",   page: 576, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "Forest Management Bureau" },
  { code: "BIS6",   page: 577, name: "Statistical Analysis, Data Management, and Production of Knowledge Products",                                                   office: "Forest Management Bureau" },
  { code: "BIS7",   page: 579, name: "Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products",                        office: "Forest Management Bureau" },
  { code: "F1",     page: 581, name: "Forest Land Use Planning",                                                                                                       office: "Forest Management Bureau" },
  { code: "F2",     page: 583, name: "Forest Resource Inventory and Assessment",                                                                                       office: "Forest Management Bureau" },
  { code: "F3",     page: 584, name: "Natural Forest Productivity Improvement",                                                                                        office: "Forest Management Bureau" },
  { code: "F4",     page: 585, name: "Forest Harvesting and Utilization",                                                                                              office: "Forest Management Bureau" },
  { code: "F5",     page: 586, name: "Scaling, Grading, and Assessment of Forest Products",                                                                            office: "Forest Management Bureau" },
  { code: "F6",     page: 587, name: "Establishment and Maintenance of Forest Nurseries",                                                                              office: "Forest Management Bureau" },
  { code: "F7",     page: 588, name: "Rehabilitation and Management of Watersheds",                                                                                    office: "Forest Management Bureau" },
  { code: "F8",     page: 589, name: "Sustainable Management of Grazing Lands",                                                                                        office: "Forest Management Bureau" },
  { code: "F9",     page: 590, name: "Forest Plantation Establishment, Maintenance and Protection",                                                                    office: "Forest Management Bureau" },
  { code: "F10",    page: 591, name: "Enforcement of Forest Laws, Rules and Regulations",                                                                              office: "Forest Management Bureau" },

  // ── LAND MANAGEMENT BUREAU ────────────────────────────────────────
  { code: "BA1",    page: 592, name: "Procurement Management",                                                                                                         office: "Land Management Bureau" },
  { code: "BA2",    page: 593, name: "Property Management",                                                                                                            office: "Land Management Bureau" },
  { code: "BA3",    page: 594, name: "Courier, Postal, and Messengerial Services",                                                                                     office: "Land Management Bureau" },
  { code: "BA4",    page: 595, name: "Repair and Maintenance",                                                                                                         office: "Land Management Bureau" },
  { code: "BA5",    page: 596, name: "Repair and Fabrication",                                                                                                         office: "Land Management Bureau" },
  { code: "BA6",    page: 597, name: "Motor Pool Services Management",                                                                                                 office: "Land Management Bureau" },
  { code: "BA7",    page: 598, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Land Management Bureau" },
  { code: "BA8",    page: 599, name: "Cash Management",                                                                                                                office: "Land Management Bureau" },
  { code: "BA9",    page: 600, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Land Management Bureau" },
  { code: "BA10",   page: 601, name: "Customer Assistance and Request Handling",                                                                                       office: "Land Management Bureau" },
  { code: "BHR1",   page: 602, name: "Recruitment, Selection and Placement",                                                                                           office: "Land Management Bureau" },
  { code: "BHR2",   page: 604, name: "Compensation, Benefits, and Welfare Administration",                                                                             office: "Land Management Bureau" },
  { code: "BHR3",   page: 605, name: "Processing of Personnel Actions",                                                                                                office: "Land Management Bureau" },
  { code: "BHR4",   page: 606, name: "Grievance Handling",                                                                                                             office: "Land Management Bureau" },
  { code: "BHR5",   page: 607, name: "HR Planning",                                                                                                                    office: "Land Management Bureau" },
  { code: "BHR6",   page: 608, name: "Learning Needs Assessment (LNA)",                                                                                                office: "Land Management Bureau" },
  { code: "BHR7",   page: 609, name: "Preparation of Learning Design",                                                                                                 office: "Land Management Bureau" },
  { code: "BHR8",   page: 610, name: "Learning Program Management",                                                                                                    office: "Land Management Bureau" },
  { code: "BHR9",   page: 611, name: "Learning Event Facilitation",                                                                                                    office: "Land Management Bureau" },
  { code: "BHR10",  page: 612, name: "Networking and Linkaging with HR Partners",                                                                                     office: "Land Management Bureau" },
  { code: "BHR11",  page: 613, name: "Monitoring and Evaluation (M&E) of L&D Programs",                                                                              office: "Land Management Bureau" },
  { code: "BHR12",  page: 614, name: "Scholarship Administration",                                                                                                     office: "Land Management Bureau" },
  { code: "BHR13",  page: 615, name: "Career Development",                                                                                                             office: "Land Management Bureau" },
  { code: "BFM1",   page: 616, name: "General Accounting",                                                                                                             office: "Land Management Bureau" },
  { code: "BFM2",   page: 618, name: "Budget Preparation",                                                                                                             office: "Land Management Bureau" },
  { code: "BFM3",   page: 619, name: "Budget Administration and Control",                                                                                              office: "Land Management Bureau" },
  { code: "BP1",    page: 621, name: "Planning and Programming",                                                                                                       office: "Land Management Bureau" },
  { code: "BP2",    page: 623, name: "Policy Analysis and Development",                                                                                                office: "Land Management Bureau" },
  { code: "BP3",    page: 625, name: "Monitoring and Evaluation of Lands Programs. Projects and Activities",                                                          office: "Land Management Bureau" },
  { code: "BIS1",   page: 627, name: "Information Systems and Application Software Development and Maintenance",                                                       office: "Land Management Bureau" },
  { code: "BIS2",   page: 629, name: "Network Infrastructure and System Management",                                                                                   office: "Land Management Bureau" },
  { code: "BIS3",   page: 631, name: "Information and Communication Technologies (ICT) Resource Management",                                                          office: "Land Management Bureau" },
  { code: "BIS4",   page: 632, name: "Cyber Security and Information Security",                                                                                        office: "Land Management Bureau" },
  { code: "BIS5",   page: 633, name: "Statistical and Spatial Analyses and Data Management",                                                                           office: "Land Management Bureau" },
  { code: "L1",     page: 635, name: "Surveying",                                                                                                                      office: "Land Management Bureau" },
  { code: "L2",     page: 636, name: "Mapping",                                                                                                                        office: "Land Management Bureau" },
  { code: "L3",     page: 637, name: "Survey Verification",                                                                                                            office: "Land Management Bureau" },
  { code: "L4",     page: 638, name: "Land Management",                                                                                                                office: "Land Management Bureau" },
  { code: "L5",     page: 639, name: "Land Disposition",                                                                                                               office: "Land Management Bureau" },
  { code: "L6",     page: 640, name: "Investigation and Resolution of Land Claims and Conflicts Cases and Administrative Complaints",                                  office: "Land Management Bureau" },
  { code: "L7",     page: 642, name: "Land Records and Knowledge Management",                                                                                          office: "Land Management Bureau" },
  { code: "L8",     page: 643, name: "Land Administration and Management System",                                                                                      office: "Land Management Bureau" },
  { code: "L9",     page: 644, name: "Litigation",                                                                                                                     office: "Land Management Bureau" },

  // ── ENVIRONMENTAL MANAGEMENT BUREAU ──────────────────────────────
  { code: "AS1",    page: 649, name: "Cash Management",                                                                                                                office: "Environmental Management Bureau" },
  { code: "AS2",    page: 650, name: "Procurement Management",                                                                                                         office: "Environmental Management Bureau" },
  { code: "AS3",    page: 652, name: "Property Management (Property Inventory and Disposal Management)",                                                               office: "Environmental Management Bureau" },
  { code: "AS4",    page: 654, name: "Building Maintenance System Administration",                                                                                     office: "Environmental Management Bureau" },
  { code: "AS5",    page: 655, name: "Records Management",                                                                                                             office: "Environmental Management Bureau" },
  { code: "AS6",    page: 656, name: "Computerized Records Management",                                                                                                office: "Environmental Management Bureau" },
  { code: "AS7",    page: 657, name: "Courier, Postal and Messengerial Services",                                                                                      office: "Environmental Management Bureau" },
  { code: "AS8",    page: 658, name: "General Accounting",                                                                                                             office: "Environmental Management Bureau" },
  { code: "AS9",    page: 660, name: "Organization and Management Systems Improvement",                                                                                office: "Environmental Management Bureau" },
  { code: "AS10",   page: 662, name: "Budget Preparation",                                                                                                             office: "Environmental Management Bureau" },
  { code: "AS11",   page: 663, name: "Budget Administration and Control",                                                                                              office: "Environmental Management Bureau" },
  { code: "AS12",   page: 665, name: "Recruitment, Selection and Placement",                                                                                           office: "Environmental Management Bureau" },
  { code: "AS13",   page: 666, name: "Learning and Development",                                                                                                       office: "Environmental Management Bureau" },
  { code: "AS14",   page: 668, name: "Compensation, Benefits and Welfare Administration",                                                                              office: "Environmental Management Bureau" },
  { code: "AS15",   page: 669, name: "Performance Management",                                                                                                         office: "Environmental Management Bureau" },
  { code: "AS16",   page: 670, name: "Handling of Human Resource Actions",                                                                                             office: "Environmental Management Bureau" },
  { code: "AS17",   page: 671, name: "Workforce Planning",                                                                                                             office: "Environmental Management Bureau" },
  { code: "AS18",   page: 672, name: "EMS Wellness, Security, Safety, Emergency Preparedness and Disaster Management",                                                office: "Environmental Management Bureau" },
  { code: "EP1",    page: 673, name: "Environmental Planning, Programming and Evaluation",                                                                             office: "Environmental Management Bureau" },
  { code: "EP2",    page: 675, name: "Policy Review and Analysis",                                                                                                     office: "Environmental Management Bureau" },
  { code: "EP3",    page: 677, name: "Project Monitoring",                                                                                                             office: "Environmental Management Bureau" },
  { code: "EP4",    page: 680, name: "Statistics and Information Systems Management",                                                                                  office: "Environmental Management Bureau" },
  { code: "IS1",    page: 682, name: "Application Systems Development",                                                                                                office: "Environmental Management Bureau" },
  { code: "IS2",    page: 683, name: "Systems Analysis and Design",                                                                                                    office: "Environmental Management Bureau" },
  { code: "IS3",    page: 685, name: "Network Infrastructure Management",                                                                                              office: "Environmental Management Bureau" },
  { code: "IS4",    page: 686, name: "Network Systems Management",                                                                                                     office: "Environmental Management Bureau" },
  { code: "IS5",    page: 687, name: "Information Communication Technologies (ICT) Resource Management",                                                               office: "Environmental Management Bureau" },
  { code: "IS6",    page: 688, name: "Statistical Analysis, Data Management and Production of Knowledge Products",                                                    office: "Environmental Management Bureau" },
  { code: "IS7",    page: 690, name: "Spatial Analysis, Conversion of Statistical Data to Spatial Data and Conversion to Knowledge Products",                        office: "Environmental Management Bureau" },
  { code: "EL1",    page: 692, name: "Skills in Legal Research/ Opinion Disposition/ Management of Cases",                                                            office: "Environmental Management Bureau" },
  { code: "EL2",    page: 695, name: "Disposition/ Management of Cases",                                                                                               office: "Environmental Management Bureau" },
  { code: "EL3",    page: 697, name: "Legal Counseling and Arbitration",                                                                                               office: "Environmental Management Bureau" },
  { code: "EL4",    page: 697, name: "Adjudication of Pollution Cases",                                                                                                office: "Environmental Management Bureau" },
  { code: "EQ1",    page: 698, name: "Water Quality Management Policy Formulation",                                                                                    office: "Environmental Management Bureau" },
  { code: "EQ2",    page: 700, name: "Monitoring and Evaluation/ Validation of Policy Implementation",                                                                office: "Environmental Management Bureau" },
  { code: "EQ3",    page: 702, name: "Provision of Technical Assistance and Emergency Response on WQM",                                                               office: "Environmental Management Bureau" },
  { code: "EQ4",    page: 704, name: "Capacity Building on WQM",                                                                                                      office: "Environmental Management Bureau" },
  { code: "EQ5",    page: 706, name: "Air Quality Management Policy Formulation",                                                                                      office: "Environmental Management Bureau" },
  { code: "EQ6",    page: 709, name: "Monitoring and Evaluation of Air Quality Management Policy",                                                                    office: "Environmental Management Bureau" },
  { code: "EQ7",    page: 711, name: "Validation of the Implementation of Air Quality Policies and Procedures at the Regional Offices",                               office: "Environmental Management Bureau" },
  { code: "EQ8",    page: 713, name: "Processing of Environmental Certificate Related to Air Quality Management",                                                     office: "Environmental Management Bureau" },
  { code: "EQ9",    page: 715, name: "Enforcement of AQM Environment Laws",                                                                                            office: "Environmental Management Bureau" },
  { code: "EQ10",   page: 717, name: "Capability Building on AQM",                                                                                                    office: "Environmental Management Bureau" },
  { code: "EQ11",   page: 719, name: "Policy Formulation on Hazardous Waste Management (HWM)",                                                                        office: "Environmental Management Bureau" },
  { code: "EQ12",   page: 721, name: "Monitoring and Evaluation of Compliance of Facilities or Establishments",                                                       office: "Environmental Management Bureau" },
  { code: "EQ13",   page: 723, name: "Validation of Implementation of HWM Policies and Procedures at the Regional Offices",                                          office: "Environmental Management Bureau" },
  { code: "EQ14",   page: 724, name: "Processing of Registration Certificates and Clearances",                                                                        office: "Environmental Management Bureau" },
  { code: "EQ15",   page: 725, name: "Technical Assistance and Emergency Response Management",                                                                         office: "Environmental Management Bureau" },
  { code: "EQ16",   page: 727, name: "Enforcement of Hazardous Waste Management Laws",                                                                                office: "Environmental Management Bureau" },
  { code: "EQ17",   page: 729, name: "Capability Building on Hazardous Waste Management",                                                                             office: "Environmental Management Bureau" },
  { code: "EQ18",   page: 731, name: "Chemical Management Policy Formulation",                                                                                         office: "Environmental Management Bureau" },
  { code: "EQ19",   page: 733, name: "Monitoring and Evaluation of Industrial Compliance to Chemical-Related Permits and Clearances",                                 office: "Environmental Management Bureau" },
  { code: "EQ20",   page: 735, name: "Validation of Implementing Chemical Policies, Procedures and Practices at the Regional Offices",                               office: "Environmental Management Bureau" },
  { code: "EQ21",   page: 737, name: "Processing of Environmental Permits and Clearances Related to Chemical Management",                                             office: "Environmental Management Bureau" },
  { code: "EQ22",   page: 739, name: "Technical Assistance and Emergency Response Management",                                                                         office: "Environmental Management Bureau" },
  { code: "EQ23",   page: 741, name: "Enforcement of Chemical Management Laws",                                                                                        office: "Environmental Management Bureau" },
  { code: "EQ24",   page: 743, name: "Capability Building on Chemical Management",                                                                                    office: "Environmental Management Bureau" },
  { code: "EQ25",   page: 745, name: "Environmental Quality Management System",                                                                                        office: "Environmental Management Bureau" },
  { code: "EQ26",   page: 746, name: "Management of Multilateral Environmental Agreements (MEAS)",                                                                    office: "Environmental Management Bureau" },
  { code: "EQ27",   page: 748, name: "Linkaging and Networking (Technical Cooperation, Interagency Committees)",                                                      office: "Environmental Management Bureau" },
  { code: "EQ28",   page: 749, name: "Development of EQD-Information-Education and Communication Materials",                                                          office: "Environmental Management Bureau" },
  { code: "EQ29",   page: 751, name: "Environmental Quality Database Administration",                                                                                  office: "Environmental Management Bureau" },
  { code: "EI1",    page: 753, name: "Environmental Impact Evaluation",                                                                                                office: "Environmental Management Bureau" },
  { code: "EI2",    page: 754, name: "EIA Monitoring and Audit",                                                                                                       office: "Environmental Management Bureau" },
  { code: "EI3",    page: 756, name: "EIA Policy and Standards Formulation and Implementation Assessment",                                                            office: "Environmental Management Bureau" },
  { code: "EI4",    page: 757, name: "Capacity Building on EIA",                                                                                                      office: "Environmental Management Bureau" },
  { code: "EI5",    page: 758, name: "Linkaging and Networking (Technical Cooperation, Interagency Committees)",                                                      office: "Environmental Management Bureau" },
  { code: "EI6",    page: 759, name: "Development/ Dissemination of PEISS Information",                                                                               office: "Environmental Management Bureau" },
  { code: "EI7",    page: 760, name: "EIA Document Tracking and Information System Management",                                                                        office: "Environmental Management Bureau" },
  { code: "ER1",    page: 761, name: "Environmental Research Generation",                                                                                              office: "Environmental Management Bureau" },
  { code: "ER2",    page: 763, name: "Collection of Environmental Samples",                                                                                            office: "Environmental Management Bureau" },
  { code: "ER3",    page: 764, name: "Collection of Environmental Data",                                                                                               office: "Environmental Management Bureau" },
  { code: "ER4",    page: 765, name: "Data Analysis and Interpretation",                                                                                               office: "Environmental Management Bureau" },
  { code: "ER5",    page: 766, name: "Documentation and Dissemination of Results",                                                                                    office: "Environmental Management Bureau" },
  { code: "ER6",    page: 767, name: "Analysis of Environmental Samples",                                                                                              office: "Environmental Management Bureau" },
  { code: "ER7",    page: 770, name: "Equipment Maintenance and Calibration",                                                                                          office: "Environmental Management Bureau" },
  { code: "ER8",    page: 771, name: "Recognition of DENR Environmental Laboratories",                                                                                office: "Environmental Management Bureau" },
  { code: "EE1",    page: 773, name: "Curriculum Review and Development for Environmental Education",                                                                  office: "Environmental Management Bureau" },
  { code: "EE2",    page: 775, name: "Capability Building on Environmental Management",                                                                                office: "Environmental Management Bureau" },
  { code: "EE3",    page: 776, name: "Public Information Management",                                                                                                  office: "Environmental Management Bureau" },
  { code: "EE4",    page: 777, name: "Special Events Management",                                                                                                      office: "Environmental Management Bureau" },
  { code: "EE5",    page: 778, name: "IEC Materials Production",                                                                                                       office: "Environmental Management Bureau" },
  { code: "EE6",    page: 780, name: "Environmental report Documentation and Library Management of Environmental Education Resources",                                 office: "Environmental Management Bureau" },
  { code: "EW1",    page: 782, name: "Policy Research and Development on ESWM",                                                                                        office: "Environmental Management Bureau" },
  { code: "EW2",    page: 783, name: "Technical Assistance on ESWM",                                                                                                   office: "Environmental Management Bureau" },
  { code: "EW3",    page: 784, name: "Training and Information Dissemination on ESWM",                                                                                office: "Environmental Management Bureau" },
  { code: "ERO1",   page: 785, name: "Water Quality Management",                                                                                                       office: "Environmental Management Bureau" },
  { code: "ERO2",   page: 787, name: "Air Quality Management",                                                                                                         office: "Environmental Management Bureau" },
  { code: "ERO3",   page: 789, name: "Toxic Chemicals and Hazardous Waste Management",                                                                                office: "Environmental Management Bureau" },
  { code: "ERO4",   page: 791, name: "Analysis of Environmental Samples",                                                                                              office: "Environmental Management Bureau" },
  { code: "ERO5",   page: 793, name: "Environmental Impact Assessment",                                                                                                office: "Environmental Management Bureau" },
  { code: "ERO6",   page: 795, name: "EIA Monitoring and Audit",                                                                                                       office: "Environmental Management Bureau" },
  { code: "ERO7",   page: 797, name: "Environmental Planning",                                                                                                         office: "Environmental Management Bureau" },
  { code: "ERO8",   page: 799, name: "Statistics and Information Systems Management",                                                                                  office: "Environmental Management Bureau" },
  { code: "ERO9",   page: 801, name: "Environmental Information and Education",                                                                                        office: "Environmental Management Bureau" },
  { code: "ERO10",  page: 802, name: "Skills in Legal Research/ Opinion Disposition/ Management of Cases",                                                            office: "Environmental Management Bureau" },
  { code: "ERO11",  page: 805, name: "Legal Counseling and Arbitration",                                                                                               office: "Environmental Management Bureau" },
  { code: "ERO12",  page: 807, name: "Solid Waste Monitoring and Assessment",                                                                                          office: "Environmental Management Bureau" },
  { code: "ERO13",  page: 808, name: "Technical Assistance on ESWM",                                                                                                   office: "Environmental Management Bureau" },
  { code: "ERO14",  page: 809, name: "Training and Information Dissemination on ESWM",                                                                                office: "Environmental Management Bureau" },

  // ── MINES AND GEOSCIENCES BUREAU ──────────────────────────────────
  { code: "FM1",    page: 816, name: "General Accounting",                                                                                                             office: "Mines and Geosciences Bureau" },
  { code: "FM2",    page: 818, name: "Budget Preparation",                                                                                                             office: "Mines and Geosciences Bureau" },
  { code: "FM3",    page: 819, name: "Budget Administration and Control",                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "AD1",    page: 821, name: "Cash Management",                                                                                                                office: "Mines and Geosciences Bureau" },
  { code: "AD2",    page: 822, name: "Recruitment, Selection, and Placement",                                                                                          office: "Mines and Geosciences Bureau" },
  { code: "AD3",    page: 824, name: "Personnel Management",                                                                                                           office: "Mines and Geosciences Bureau" },
  { code: "AD4",    page: 827, name: "Training Management",                                                                                                            office: "Mines and Geosciences Bureau" },
  { code: "AD5",    page: 831, name: "Procurement Management",                                                                                                         office: "Mines and Geosciences Bureau" },
  { code: "AD6",    page: 833, name: "Property Management",                                                                                                            office: "Mines and Geosciences Bureau" },
  { code: "AD7",    page: 835, name: "Records Management",                                                                                                             office: "Mines and Geosciences Bureau" },
  { code: "AD8",    page: 836, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Mines and Geosciences Bureau" },
  { code: "AD9",    page: 838, name: "Emergency Preparedness and Disaster Management",                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "AD10",   page: 839, name: "Driving",                                                                                                                        office: "Mines and Geosciences Bureau" },
  { code: "AD11",   page: 841, name: "Building Maintenance System Administration",                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "AD12",   page: 842, name: "Repair and Fabrication",                                                                                                         office: "Mines and Geosciences Bureau" },
  { code: "AD13",   page: 843, name: "Motor Pool Services Management",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "AD14",   page: 844, name: "Hostel Administration",                                                                                                          office: "Mines and Geosciences Bureau" },
  { code: "AD15",   page: 845, name: "Vehicle Repair and Maintenance",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "LA1",    page: 846, name: "Skills in Legal Research",                                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "LA2",    page: 847, name: "Disposition/Management of Cases",                                                                                                office: "Mines and Geosciences Bureau" },
  { code: "LA3",    page: 849, name: "Investigation and Disposition of ENR (Mining-Related) and Administrative Complaints",                                           office: "Mines and Geosciences Bureau" },
  { code: "LS1",    page: 851, name: "Legal Note Taking",                                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "LS2",    page: 852, name: "Legal Records Management",                                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "LS3",    page: 853, name: "Clerical/ Secretarial/ Executive Assistance Skills",                                                                             office: "Mines and Geosciences Bureau" },
  { code: "MP1",    page: 855, name: "Mines and Geosciences Planning and Programming",                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "MP2",    page: 857, name: "Monitoring and Evaluation of MGB Programs and Projects",                                                                        office: "Mines and Geosciences Bureau" },
  { code: "MP3",    page: 859, name: "Policy Review and Coordination",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "MP4",    page: 860, name: "Technology Management",                                                                                                          office: "Mines and Geosciences Bureau" },
  { code: "MP5",    page: 862, name: "System and Technology Innovation and Management",                                                                                office: "Mines and Geosciences Bureau" },
  { code: "ME1",    page: 864, name: "Conduct of Studies on the Economic Evaluation of the Financial Aspect of Mining Project Feasibility Study (FS), Project Description (PD), ABD Qualification for Tax Exemption for Mining and Metallurgical Projects", office: "Mines and Geosciences Bureau" },
  { code: "ME2",    page: 866, name: "Determination and Monitoring of Government Share from FTAA Projects",                                                           office: "Mines and Geosciences Bureau" },
  { code: "ME3",    page: 867, name: "Statistical Coordination and Data Research",                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "ME4",    page: 869, name: "Public Information and Advocacy Management",                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "ME5",    page: 871, name: "Photography/ Video Production",                                                                                                  office: "Mines and Geosciences Bureau" },
  { code: "ME6",    page: 872, name: "Web Publication/ Social Media Skills",                                                                                           office: "Mines and Geosciences Bureau" },
  { code: "ME7",    page: 873, name: "Visual Communication (Graphic and Layout Designing)",                                                                            office: "Mines and Geosciences Bureau" },
  { code: "ME8",    page: 874, name: "Event Management",                                                                                                               office: "Mines and Geosciences Bureau" },
  { code: "ME9",    page: 875, name: "Networking Skills",                                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "ME10",   page: 875, name: "Networking Skills",                                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "ME11",   page: 876, name: "Library Management",                                                                                                             office: "Mines and Geosciences Bureau" },
  { code: "ME12",   page: 877, name: "Applications Development",                                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "ME13",   page: 878, name: "Systems Analysis and Design",                                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "ME14",   page: 879, name: "Web Development",                                                                                                                office: "Mines and Geosciences Bureau" },
  { code: "ME15",   page: 880, name: "Systems Management",                                                                                                             office: "Mines and Geosciences Bureau" },
  { code: "MS1",    page: 881, name: "Mine Safety and Health Management",                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "MS2",    page: 883, name: "Social/Community Development and Management",                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MS3",    page: 885, name: "Mine Environmental and Rehabilitation Management",                                                                               office: "Mines and Geosciences Bureau" },
  { code: "MT1",    page: 888, name: "Mining Project Technical Evaluation",                                                                                            office: "Mines and Geosciences Bureau" },
  { code: "MT2",    page: 890, name: "Mining Project Technical Audit",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "MT3",    page: 892, name: "Mining/ Exploration Database Management",                                                                                        office: "Mines and Geosciences Bureau" },
  { code: "MT4",    page: 894, name: "Mineral Rights Management System",                                                                                               office: "Mines and Geosciences Bureau" },
  { code: "MT5",    page: 896, name: "Geodetic Survey Management",                                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "MM1",    page: 897, name: "Coastal Geohazard Survey",                                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "MM2",    page: 898, name: "Coastal and Marine Mineral Resources Assessment",                                                                                office: "Mines and Geosciences Bureau" },
  { code: "MM3",    page: 900, name: "Marine Geological and Geophysical Survey",                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "MM4",    page: 902, name: "Ship Operation and Maintenance Management",                                                                                      office: "Mines and Geosciences Bureau" },
  { code: "MG1",    page: 903, name: "Generation of Maps and Reports",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "MG2",    page: 905, name: "Digital Geologic Information and Data System Management",                                                                        office: "Mines and Geosciences Bureau" },
  { code: "MG3",    page: 907, name: "Laboratory Analyses and Services",                                                                                               office: "Mines and Geosciences Bureau" },
  { code: "MH1",    page: 909, name: "Mine Technology Development",                                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MH2",    page: 910, name: "Mineral Reserves Inventory",                                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "MH3",    page: 911, name: "Small-Scale Mining Development",                                                                                                 office: "Mines and Geosciences Bureau" },
  { code: "MH4",    page: 912, name: "Mine Evaluation and Enforcement",                                                                                                office: "Mines and Geosciences Bureau" },
  { code: "MET1",   page: 913, name: "Provision of Metallurgical and Fire Assay Tests",                                                                                office: "Mines and Geosciences Bureau" },
  { code: "MET2",   page: 915, name: "Conduct of Metallurgical Research",                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "MET3",   page: 917, name: "Provision of Chemical and Physical Tests",                                                                                       office: "Mines and Geosciences Bureau" },
  { code: "MET4",   page: 918, name: "Provision of Mechanical-Electrical Services",                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MET5",   page: 919, name: "Conduct of Mineral Processing Permit Audit",                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MRO1",   page: 920, name: "Mining Project Technical Evaluation",                                                                                            office: "Mines and Geosciences Bureau" },
  { code: "MRO2",   page: 921, name: "Mining Investigation and Technical Assistance",                                                                                  office: "Mines and Geosciences Bureau" },
  { code: "MRO3",   page: 923, name: "Mining Project Monitoring",                                                                                                      office: "Mines and Geosciences Bureau" },
  { code: "MRO4",   page: 925, name: "Mining/Exploration on Database Management",                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "MRO5",   page: 927, name: "Mineral Rights Management System",                                                                                               office: "Mines and Geosciences Bureau" },
  { code: "MRO6",   page: 928, name: "Geodetic Survey Management",                                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "MRO7",   page: 930, name: "Ore Reserves Inventory and Validation of Mining Projects",                                                                      office: "Mines and Geosciences Bureau" },
  { code: "MRO8",   page: 931, name: "Assistance in the Operation of P/CMRB and Declaration of Minahang Bayan (MB) or People's Small-Scale Mining Area (PSSMA)",    office: "Mines and Geosciences Bureau" },
  { code: "MRO9",   page: 932, name: "Assessment of Potential and Existing Mineral Reservation Areas",                                                                office: "Mines and Geosciences Bureau" },
  { code: "MRO10",  page: 933, name: "Quadrangle Geologic Mapping",                                                                                                   office: "Mines and Geosciences Bureau" },
  { code: "MRO11",  page: 935, name: "Mineral Resources Assessment and Characterization",                                                                              office: "Mines and Geosciences Bureau" },
  { code: "MRO12",  page: 937, name: "Geohazard and Engineering Geological Assessment",                                                                                office: "Mines and Geosciences Bureau" },
  { code: "MRO13",  page: 940, name: "Hydrogeological Assessment",                                                                                                     office: "Mines and Geosciences Bureau" },
  { code: "MRO14",  page: 941, name: "Digital Geologic Information and Database System Management",                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MRO15",  page: 942, name: "Laboratory Analyses and Services",                                                                                               office: "Mines and Geosciences Bureau" },
  { code: "MRO16",  page: 944, name: "Study on Small-Scale Mining and Quarrying Operations",                                                                           office: "Mines and Geosciences Bureau" },
  { code: "MRO17",  page: 945, name: "Mine Safety and Health Management",                                                                                              office: "Mines and Geosciences Bureau" },
  { code: "MRO18",  page: 947, name: "Social/Community Development and Management",                                                                                    office: "Mines and Geosciences Bureau" },
  { code: "MRO19",  page: 949, name: "Mine Environmental Management",                                                                                                  office: "Mines and Geosciences Bureau" },
  { code: "MRO20",  page: 951, name: "Planning, Programming and Monitoring",                                                                                           office: "Mines and Geosciences Bureau" },

  // ── ALL OFFICES ───────────────────────────────────────────────────
  { code: "CC1",    page: 952, name: "Discipline",                                                                                                                     office: "All Offices" },
  { code: "CC2",    page: 954, name: "Excellence",                                                                                                                     office: "All Offices" },
  { code: "CC3",    page: 956, name: "Nobility",                                                                                                                       office: "All Offices" },
  { code: "CC4",    page: 957, name: "Responsibility",                                                                                                                 office: "All Offices" },
  { code: "CC5",    page: 958, name: "Caring for the Environment and Natural Resources",                                                                               office: "All Offices" },
  { code: "OC1",    page: 959, name: "Writing Effectively",                                                                                                            office: "All Offices" },
  { code: "OC2",    page: 960, name: "Speaking Effectively",                                                                                                           office: "All Offices" },
  { code: "OC3",    page: 962, name: "Technology Literacy and Managing Information",                                                                                   office: "All Offices" },
  { code: "OC4",    page: 964, name: "Project Management",                                                                                                             office: "All Offices" },
  { code: "OC5",    page: 965, name: "Completed Staff Work (CSW)",                                                                                                     office: "All Offices" },
  { code: "LC1",    page: 966, name: "Strategic Leadership (Thinking Strategically and Creatively)",                                                                   office: "All Offices" },
  { code: "LC2",    page: 968, name: "Leading Change",                                                                                                                 office: "All Offices" },
  { code: "LC3",    page: 970, name: "People Development (Creating and Nurturing a High Performing Organization)",                                                    office: "All Offices" },
  { code: "LC4",    page: 972, name: "People Performance Management (Managing Performance and Coaching for Results)",                                                  office: "All Offices" },
  { code: "LC5",    page: 974, name: "Partnership and Networking (Building Collaborative and Inclusive Working Relationships)",                                        office: "All Offices" },
];


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMN_BOUNDARIES = [192, 384, 589];
const LEVEL_NAMES = ['BASIC', 'INTERMEDIATE', 'ADVANCED', 'SUPERIOR'];
const PDF_PATH = '/rhrmpsb-system/2025_CBS.pdf';

// ── FIX: allow optional space between letters and digits, e.g. "RSCI 6" ──
// Capture group 1 normalises the code by removing any internal space.
const CODE_RE = /^([A-Z]+)\s?(\d+[A-Z]?)\s*[-–]\s*(.+)/;

/** Normalise a raw PDF code string → compact form, e.g. "RSCI 6" → "RSCI6" */
function normalizeCode(raw) {
  return raw.replace(/\s+/g, '').toUpperCase();
}

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
    // Skip bare code tokens (both compact "RSCI6" and spaced "RSCI 6")
    if (/^[A-Z]{1,5}\s?\d+[A-Z]?$/.test(t)) continue;
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

    const tocCodeSet = new Set(TOC_INDEX.map(e => e.code.toUpperCase()));
    const pdfLocsFiltered = pdfLocs.filter(l => tocCodeSet.has(l.code.toUpperCase()));
    const nextLocIdx = pdfLocsFiltered.findIndex(l =>
      (l.pi > foundLoc.pi) || (l.pi === foundLoc.pi && l.y > foundLoc.y + 30)
    );
    const nextLoc = nextLocIdx >= 0 ? pdfLocsFiltered[nextLocIdx] : null;

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
