// Data extracted from the CSV snippet and merged with the original approversData
const companyUserIdsMap = {
  "ADCRO": [
    "NGMCLON",
    "NGMCCON",
    "NGMCCOA"
  ],
  "JOCAP": [
    "NGMCLLO",
    "NGMCLON",
    "NGMCSCO",
    "NGMCINT",
    "NGDOOR"
  ],
  "KLEWIS": [
    "NGMCLON",
    "NGMCUK"
  ],
  "TUDAL": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA",
    "NGMCLSE"
  ],
  "BEWIL": [
    "NGMCLON",
    "NGMCKRM",
    "NGMCOUT",
    "NGMCREP"
  ],
  "EBRAD": [
    "NGMCLON"
  ],
  "HAOUG": [
    "NGMCLON",
    "NGOPEM"
  ],
  "HAWAL": [
    "NGMCLON",
    "NGMCKRM",
    "NGMCALL",
    "NGMCINT"
  ],
  "LUPIC": [
    "NGMCLON",
    "NGMCINT",
    "NGOPEM",
    "NGOPEN"
  ],
  "RCHAM": [
    "NGMCLON"
  ],
  "RPALM": [
    "NGMCLON",
    "NGMCMBA",
    "NGOPEM",
    "NGOPEN"
  ],
  "SCORE": [
    "NGMCLON"
  ],
  "AROBE": [
    "NGMCLON",
    "NGMCKRM",
    "NGMCOUT"
  ],
  "JGORN": [
    "NGMCLON",
    "NGMCMBA"
  ],
  "LTURN": [
    "NGMCLON",
    "NGMCKRM",
    "NGMCCOA"
  ],
  "MNIKO": [
    "NGMCLON",
    "NGMCMBA",
    "NGMCINT",
    "NGMCALL"
  ],
  "NCART": [
    "NGMCLON"
  ],
  "ROWAL": [
    "NGMCLON",
    "NGMCKRM"
  ],
  "SMEYER": [
    "NGMCLON"
  ],
  "TEBUC": [
    "NGMCLON",
    "NGMCSCO"
  ],
  "APYKE": [
    "NGMCLON"
  ],
  "CRIDS": [
    "NGMCLON",
    "NGMCWBA"
  ],
  "HSPRI": [
    "NGMCLON",
    "NGOPEM"
  ],
  "ISLAW": [
    "NGMCLON",
    "NGMCWBA",
    "NGOPEN",
    "NGOPEM"
  ],
  "KBEAR": [
    "NGMCLON",
    "NGMCWBA"
  ],
  "LASCOT": [
    "NGMCKRM",
    "NGMCUK",
    "NGMCLON"
  ],
  "MEWIL": [
    "NGMCLON",
    "NGMCSCO",
    "NGMCINT",
    "NGMCCOA",
    "NGMCMBA",
    "NGOPEM"
  ],
  "SHSHA": [
    "NGMCLLO",
    "NGMCLON",
    "NGMCNUC",
    "NGMCALL"
  ],
  "SSWEE": [
    "NGMCMBA",
    "NGMCLON",
    "NGMCALL",
    "NGMCWBA"
  ],
  "KATRE": [
    "NGMCLON",
    "NGMCSCO",
    "NGMCKRM",
    "NGMCINT"
  ],
  "TLATH": [
    "NGMCLON",
    "NGMCSCO",
    "NGMCKRM",
    "NGMCCOA"
  ],
  "AMGIBS": [
    "NGMCLON"
  ],
  "KOGIL": [
    "NGMCLON",
    "NGMCMBA",
    "NGMCNUC",
    "NGMCUK",
    "NGMCINT"
  ],
  "LFILB": [
    "NGMCLON",
    "NGMCINT"
  ],
  "PJAMESON": [
    "NGMCLON",
    "NGMCALL",
    "NGOPEM"
  ],
  "YNDLO": [
    "NGMCLON",
    "NGMCINT"
  ],
  "GBARL": [
    "NGMCLON",
    "NGMCINT"
  ],
  "MMIND": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "RDIXO": [
    "NGMCLON",
    "NGMCALL",
    "NGMCINT"
  ],
  "VIOAN": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON",
    "NGMCMBA"
  ],
  "YPAPA": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "AMUEL": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCON"
  ],
  "AWIJE": [
    "NGMCINT",
    "NGMCLON",
    "NGMCALL"
  ],
  "BESTA": [
    "NGMCEMA",
    "NGMCINT",
    "NGMCLSE",
    "NGMCALL"
  ],
  "CMCWH": [
    "NGMCCOA",
    "NGMCINT",
    "NGMCLON",
    "NGMCALL"
  ],
  "GGILB": [
    "NGMCINT",
    "NGMCLON",
    "NGMCMBA"
  ],
  "HMCCA": [
    "NGMCWWD",
    "NGMCINT",
    "NGMCALL"
  ],
  "JASLA": [
    "NGMCINT",
    "NGMCWWD",
    "NGMCEMA",
    "NGMCGLB"
  ],
  "KEMCG": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "KHAVE": [
    "NGMCINT",
    "NGMCLON",
    "NGMCLSE",
    "NGMCALL"
  ],
  "LKUCU": [
    "NGMCLON",
    "NGMCWWD",
    "NGMCALL",
    "NGMCLSW",
    "NGMCINT",
    "NGOPEM"
  ],
  "NELIO": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "RESCO": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "ROCOL": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "SCROW": [
    "NGMCLON",
    "NGMCKRM",
    "NGMCINT",
    "NGMCALL"
  ],
  "ADENE": [
    "NGMCINT"
  ],
  "ADMCC": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "ANGIM": [
    "NGMCINT"
  ],
  "ANIKO": [
    "NGMCINT"
  ],
  "ASHEI": [
    "NGMCINT"
  ],
  "ASTEP": [
    "NGMCINT",
    "NGMCLON"
  ],
  "BDRUR": [
    "NGMCINT",
    "NGMCLON",
    "NGMCEMA"
  ],
  "CBECK": [
    "NGMCLON",
    "NGMCCOA",
    "NGMCINT",
    "NGMCALL"
  ],
  "CROSE": [
    "NGMAXESS",
    "NGMSESS"
  ],
  "CSAUN": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "CTUTT": [
    "NGMCINT",
    "NGMCLON",
    "NGMCALL"
  ],
  "DADAR": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "DCABU": [
    "NGMCINT",
    "NGMCLON",
    "NGMCALL"
  ],
  "DDWIN": [
    "NGMCLON",
    "NGMCINT"
  ],
  "ELDAV": [
    "NGMCWWD",
    "NGMCMBA",
    "NGMCSPO",
    "NGMCINT",
    "NGMCALL",
    "NGOPEM",
    "NGOPEN"
  ],
  "ELIMA": [
    "NGMCINT"
  ],
  "ELLES": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "HANMC": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "HCONS": [
    "NGMCLON",
    "NGMCMBA",
    "NGMCINT"
  ],
  "HLETR": [
    "NGMCWWD",
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "HWILS": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "JACKH": [
    "NGMCLON",
    "NGMCCOA",
    "NGMCALL",
    "NGMCINT"
  ],
  "JHELM": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "JOLAR": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "JORSE": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA"
  ],
  "KATKN": [
    "NGMCINT"
  ],
  "LIBRE": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA",
    "NGMCALL"
  ],
  "MAMAT": [
    "NGMCLON",
    "NGMCINT",
    "NGMCMBA"
  ],
  "MASSI": [
    "NGMCLON",
    "NGMCCOA",
    "NGMCALL",
    "NGMCINT"
  ],
  "MBUFT": [
    "NGMCESCO",
    "NGMCINT",
    "NGOPEM"
  ],
  "MJELMAN": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "MKOLL": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "OJOSH": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA"
  ],
  "PSHRI": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "REONE": [
    "NGMCLON",
    "NGMCWWD",
    "NGMCALL",
    "NGMCLSW",
    "NGMCINT"
  ],
  "SBURT": [
    "NGMCLON",
    "NGMCCOA",
    "NGMCALL",
    "NGMCINT"
  ],
  "SZANO": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA"
  ],
  "TMYLE": [
    "NGMCLON",
    "NGMCINT"
  ],
  "VLOUD": [
    "NGMCINT",
    "NGMCLON"
  ],
  "WBLAN": [
    "NGMCINT",
    "NGMCEMA",
    "NGMCALL",
    "NGMCLON"
  ],
  "ANCOO": [
    "NGMCNOR",
    "NGMCBRB",
    "NGMCBRL",
    "NGMCNAL",
    "NGMCLON"
  ],
  "BISAM": [
    "NGMCBRL",
    "NGMCNAL",
    "NGMCNAC",
    "NGMCBRB",
    "NGMCNOR",
    "NGMCNOL"
  ],
  "BMALA": [
    "NGMCBRL",
    "NGMCNAL"
  ],
  "BSHEA": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAC",
    "NGMCWBA"
  ],
  "DANBE": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAL",
    "NGMCCOA",
    "NGMCCON",
    "NGMCINT"
  ],
  "DAROBI": [
    "NGMCNOR",
    "NGMCNAL",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAC",
    "NGMCUK",
    "NGMCLON"
  ],
  "DHIGH": [
    "NGMCNOR",
    "NGMCNAL",
    "NGMCBRB",
    "NGMCNOL",
    "NGMCBRL"
  ],
  "DSTAND": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAL",
    "NGMCLON",
    "NGMCMBA"
  ],
  "ESTRU": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAC",
    "NGMCLON"
  ],
  "GSPIN": [
    "NGMCNOR",
    "NGMCNAL",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCLON"
  ],
  "HWHIT": [
    "NGMCBRL",
    "NGMCNAL"
  ],
  "JCOLL": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAL",
    "NGMCMBA"
  ],
  "JONWA": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAC",
    "NGMCUK"
  ],
  "LKURT": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAL",
    "NGMCUK",
    "NGMCLON",
    "NGMCMBA"
  ],
  "MSTIR3": [
    "NGMCNOR",
    "NGMCNAL",
    "NGMCBRB",
    "NGMCBRL"
  ],
  "RMCDO": [
    "NGMCLON",
    "NGMCMBA",
    "NGMCUK",
    "NGMCNAL"
  ],
  "SHASL2": [
    "NGMCNOR",
    "NGMCNAL",
    "NGMCNOL"
  ],
  "LAGOR": [
    "NGDOOR",
    "NGMCLON"
  ],
  "THODE": [
    "NGMCLON",
    "NGMCWBA",
    "NGMCUK",
    "NGDOOR"
  ],
  "VIJMU": [
    "NGDOOR"
  ],
  "RHETE": [
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA",
    "NGOPEN",
    "NGOPEM"
  ],
  "SHIKP": [
    "NGMCLSW",
    "NGMCALL",
    "NGMCINT",
    "NGMCLON",
    "NGOPEN",
    "NGOPEM"
  ],
  "VALDA": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "JACOL": [
    "NGMCSCO",
    "NGMCALL",
    "NGMCCON"
  ],
  "JANEW": [
    "NGMCSCO",
    "NGMCCON",
    "NGMCLON"
  ],
  "KMILL": [
    "NGMCSCO",
    "NGMCCOA"
  ],
  "KSTEW": [
    "NGMCSCO",
    "NGMCCON"
  ],
  "MACANT": [
    "NGMCSCO",
    "NGMCLON",
    "NGMCCON"
  ],
  "MICHT": [
    "NGMCSCO",
    "NGMCESCO",
    "NGMCCON"
  ],
  "RLITT": [
    "NGMCSCO",
    "NGMCCON",
    "NGMCLON"
  ],
  "ADSMI": [
    "NGMCINT"
  ],
  "AMILE": [
    "NGMCMBA",
    "NGMCLON"
  ],
  "CMAST": [
    "NGMCINT",
    "NGMCLON",
    "NGMCALL",
    "NGMCCON"
  ],
  "CTURN": [
    "NGMCNOR",
    "NGMCBRL",
    "NGMCBRB",
    "NGMCNAL",
    "NGMCCOA",
    "NGMCALL",
    "NGMCUK",
    "NGMCLON",
    "NGOPEM"
  ],
  "IMACD": [
    "NGMCMBA",
    "NGMCLON",
    "NGMCNUC",
    "NGMCALL",
    "NGMCBRL",
    "NGMCUK",
    "NGMCINT",
    "NGMCCOA"
  ],
  "JBOCK": [
    "NGMCMBA",
    "NGMCLON",
    "NGMCNUC",
    "NGMCALL",
    "NGOPEN"
  ],
  "KAREI": [
    "NGMCLON",
    "NGMCKRM"
  ],
  "KGRAC": [
    "NGMCINT",
    "NGMCALL",
    "NGMCLON"
  ],
  "MAHOW": [
    "NGMCMBA",
    "NGMCLON",
    "NGMCINT",
    "NGMCBRL"
  ],
  "MKALU": [
    "NGMCLON",
    "NGMCINT"
  ],
  "OMCAL": [
    "NGMCLON",
    "NGMCINT",
    "NGMCALL"
  ],
  "RBARD": [
    "NGMCINT"
  ],
  "SCUSH": [
    "NGMCINT"
  ],
  "SLADA": [
    "NGMCMBA",
    "NGMCLON",
    "NGMCINT",
    "NGMCCOA",
    "NGMCBRL"
  ],
  "TLOON": [
    "NGMCALL",
    "NGMCESCO",
    "NGMCINT"
  ]
};

function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}

export const approversData = [{
  id: "ADCRO",
  firstName: "Adam",
  lastName: "Crow",
  email: "adam.crow@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "All"
}, {
  id: "ADENE",
  firstName: "Adeel",
  lastName: "Nehim",
  email: "adeel.nehim@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International",
  specialty: "Social"
}, {
  id: "ADMCC",
  firstName: "Adeola",
  lastName: "Mccabe",
  email: "adeola.mccabe@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International",
  specialty: "Social"
}, {
  id: "ADSMI",
  firstName: "Adam",
  lastName: "Smith",
  email: "adam.smith1@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "PPC",
  specialty: "PPC"
}, {
  id: "AMGIBS",
  firstName: "Amelia",
  lastName: "Monks",
  email: "amelia.monks@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "BU5"
}, {
  id: "AMILE",
  firstName: "Ana",
  lastName: "Cuellar",
  email: "ana.cuellar@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "SEO",
  specialty: "SEO"
}, {
  id: "AMUEL",
  firstName: "Adrian",
  lastName: "Mueller",
  email: "adrian.mueller@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Global"
}, {
  id: "ANCOO",
  firstName: "Andrew",
  lastName: "Cook",
  email: "andrew.cook@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "ANGIM",
  firstName: "Anna",
  lastName: "Gim",
  email: "anna.gim@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "ANIKO",
  firstName: "Athina",
  lastName: "Nikol",
  email: "athina.nikol@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "APYKE",
  firstName: "Adam",
  lastName: "Pyke",
  email: "adam.pyke@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12",
  specialty: "PPC"
}, {
  id: "AROBE",
  firstName: "Amy",
  lastName: "Roberts",
  email: "amy.roberts@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "BU3"
}, {
  id: "ASHEI",
  firstName: "Ashleigh",
  lastName: "Heitman",
  email: "ashleigh.heitman@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "ASTEP",
  firstName: "Adam",
  lastName: "Stephens",
  email: "adam.stephens@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "AWIJE",
  firstName: "Adrian",
  lastName: "Wijenathan",
  email: "adrian.wijenathan@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "BDRUR",
  firstName: "Beth",
  lastName: "Drury",
  email: "beth.drury@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "BESTA",
  firstName: "Ben",
  lastName: "Stanhope",
  email: "ben.stanhope1@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Global"
}, {
  id: "BEWIL",
  firstName: "Becci",
  lastName: "Wilson",
  email: "becci.wilson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "BISAM",
  firstName: "Billy",
  lastName: "Samuels",
  email: "billy.samuels@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "BMALA",
  firstName: "Ben",
  lastName: "Malam",
  email: "ben.malam@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "BSHEA",
  firstName: "Briony",
  lastName: "Sheard",
  email: "briony.sheard@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPROV",
  businessUnit: "North"
}, {
  id: "CBECK",
  firstName: "Christofer",
  lastName: "Beckman",
  email: "christofer.beckman@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "CMAST",
  firstName: "Caroline",
  lastName: "Mastromauro",
  email: "caroline.mastromauro@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "PST"
}, {
  id: "CMCWH",
  firstName: "Caroline",
  lastName: "Mcwhirter",
  email: "caroline.mcwhirter@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Global"
}, {
  id: "CRIDS",
  firstName: "Carys",
  lastName: "Profitdale",
  email: "carys.profitdale@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "CROSE",
  firstName: "Cheyenne",
  lastName: "Rose",
  email: "cheyenne.rose@essencemediacom.com",
  officeName: "ESSENCE",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "CSAUN",
  firstName: "Charlie",
  lastName: "Saunders",
  email: "charlie.saunders@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "CTURN",
  firstName: "Chris",
  lastName: "Turner",
  email: "chris.turner@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPROV",
  businessUnit: "PST",
  specialty: "PST"
}, {
  id: "CTUTT",
  firstName: "Connor",
  lastName: "Tuttle",
  email: "connor.tuttle@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "DADAR",
  firstName: "Danielle",
  lastName: "Darko",
  email: "danielle.darko@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "International"
}, {
  id: "DANBE",
  firstName: "Danielle",
  lastName: "Bennett",
  email: "danielle.bennett@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "DAROBI",
  firstName: "Dan",
  lastName: "Robinson",
  email: "dan.robinson@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "DCABU",
  firstName: "Damla",
  lastName: "Cabuk",
  email: "damla.cabuk@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "DDWIN",
  firstName: "Danique",
  lastName: "De Winter",
  email: "danique.dewinter@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "DHIGH",
  firstName: "Dean",
  lastName: "Highfield",
  email: "dean.highfield@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "DSTAND",
  firstName: "David",
  lastName: "Standaloft",
  email: "david.standaloft@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPROV",
  businessUnit: "North"
}, {
  id: "EBRAD",
  firstName: "Emma",
  lastName: "Brady",
  email: "emma.brady@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "ELDAV",
  firstName: "Ella",
  lastName: "Davies",
  email: "ella.davies@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "ELIMA",
  firstName: "Erza",
  lastName: "Limani",
  email: "erza.limani@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "ELLES",
  firstName: "Ellie",
  lastName: "Esplen",
  email: "ellie.esplen@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "ESTRU",
  firstName: "Emma",
  lastName: "Struggles",
  email: "emma.struggles@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "GBARL",
  firstName: "Georgina",
  lastName: "Barlow",
  email: "georgina.barlow@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Dell"
}, {
  id: "GGILB",
  firstName: "George",
  lastName: "Gilbert",
  email: "george.gilbert@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "GSPIN",
  firstName: "Gemma",
  lastName: "Spink",
  email: "gemma.spink@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "HANMC",
  firstName: "Hannah",
  lastName: "Mcloughlin",
  email: "hannah.mcloughlin@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "HAOUG",
  firstName: "Harjit",
  lastName: "Oughera",
  email: "harjit.oughera@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "HAWAL",
  firstName: "Harriet",
  lastName: "Waldron",
  email: "harriet.waldron@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "HCONS",
  firstName: "Harley",
  lastName: "Constable",
  email: "harley.constable@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "HLETR",
  firstName: "Hieu",
  lastName: "Letrung",
  email: "hieu.letrung1@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "HMCCA",
  firstName: "Hayley",
  lastName: "Mccauley",
  email: "hayley.mccauley@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Global"
}, {
  id: "HSPRI",
  firstName: "Henry",
  lastName: "Springate",
  email: "henry.springate@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "HWHIT",
  firstName: "Helen",
  lastName: "Whitley",
  email: "helen.whitley@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "HWILS",
  firstName: "Holly",
  lastName: "Parker",
  email: "holly.parker@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "IMACD",
  firstName: "Isobel",
  lastName: "Macdougall",
  email: "isobel.macdougall@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "eCom"
}, {
  id: "ISLAW",
  firstName: "Isla",
  lastName: "Watson",
  email: "isla.watson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "B12",
  specialty: "PPC"
}, {
  id: "JACKH",
  firstName: "Jack",
  lastName: "Harmon",
  email: "jack.harmon@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "International"
}, {
  id: "JACOL",
  firstName: "Jamie",
  lastName: "Collins",
  email: "jamie.collins@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Scotland"
}, {
  id: "JANEW",
  firstName: "Jane",
  lastName: "Wilson",
  email: "jane.wilson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Scotland"
}, {
  id: "JASLA",
  firstName: "Jade",
  lastName: "Slater",
  email: "jade.slater@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Global"
}, {
  id: "JBOCK",
  firstName: "Jeremy",
  lastName: "Bock",
  email: "jeremy.bock@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "SEO",
  specialty: "SEO"
}, {
  id: "JCOLL",
  firstName: "Jared",
  lastName: "Collins",
  email: "jared.collins@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRPO",
  businessUnit: "North"
}, {
  id: "JGORN",
  firstName: "Joshua",
  lastName: "Gornell",
  email: "joshua.gornell@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU3"
}, {
  id: "JHELM",
  firstName: "John",
  lastName: "Helm",
  email: "john.helm@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "International"
}, {
  id: "JOCAP",
  firstName: "Joe",
  lastName: "Capildeo",
  email: "joe.capildeo@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "All"
}, {
  id: "JOLAR",
  firstName: "Joel",
  lastName: "Large",
  email: "joel.large@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "JORSE",
  firstName: "Jordan",
  lastName: "Seddon",
  email: "jordan.seddon@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "KAREI",
  firstName: "Karen",
  lastName: "Reid",
  email: "karen.reid@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Print",
  specialty: "Print"
}, {
  id: "KATKN",
  firstName: "Katarina",
  lastName: "Knazeova",
  email: "katarina.knazeova@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "KATRE",
  firstName: "Kathryn",
  lastName: "Reid",
  email: "kathryn.reid@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "BU3"
}, {
  id: "KBEAR",
  firstName: "Kayleigh",
  lastName: "Beard",
  email: "kayleigh.beard@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "B12",
  specialty: "Social"
}, {
  id: "KEMCG",
  firstName: "Kelly",
  lastName: "Mcguinness",
  email: "kelly.mcguinness@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Global"
}, {
  id: "KGRAC",
  firstName: "Klaudia",
  lastName: "Graczyk",
  email: "klaudia.graczyk@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "PST"
}, {
  id: "KHAVE",
  firstName: "Krishna",
  lastName: "Haveliwala",
  email: "krishna.haveliwala@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "KLEWIS",
  firstName: "Katie",
  lastName: "Lewis",
  email: "katie.lewis@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "All"
}, {
  id: "KMILL",
  firstName: "Kayleigh",
  lastName: "Mills",
  email: "kayleigh.mills@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Scotland"
}, {
  id: "KOGIL",
  firstName: "Kirsty",
  lastName: "Ogilvie",
  email: "kirsty.ogilvie@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU5"
}, {
  id: "KSTEW",
  firstName: "Kirsty",
  lastName: "Anderson",
  email: "kirsty.anderson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Scotland"
}, {
  id: "LAGOR",
  firstName: "Lauren",
  lastName: "Gore",
  email: "lauren.gore@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "OpenDoor"
}, {
  id: "LASCOT",
  firstName: "Laura",
  lastName: "Smith",
  email: "laura.smith@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "B12"
}, {
  id: "LFILB",
  firstName: "Laurence",
  lastName: "Filby",
  email: "laurence.filby@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "BU5"
}, {
  id: "LIBRE",
  firstName: "Liam",
  lastName: "Brennan",
  email: "liam.brennan1@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "LKUCU",
  firstName: "Laden",
  lastName: "Kucuk",
  email: "laden.kucuk1@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Global"
}, {
  id: "LKURT",
  firstName: "Ledi",
  lastName: "Kurtula",
  email: "ledi.kurtula@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPROV",
  businessUnit: "North"
}, {
  id: "LTURN",
  firstName: "Luke",
  lastName: "Turner",
  email: "luke.turner@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBYJM",
  businessUnit: "BU3"
}, {
  id: "LUPIC",
  firstName: "Lucy",
  lastName: "Pickering",
  email: "lucy.pickering@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "MACANT",
  firstName: "Maud",
  lastName: "Cant",
  email: "maud.cant@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRGBY",
  businessUnit: "Scotland"
}, {
  id: "MAHOW",
  firstName: "Margo",
  lastName: "Howie",
  email: "margo.howie@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "eCom"
}, {
  id: "MAMAT",
  firstName: "Madeleine",
  lastName: "Mather",
  email: "madeleine.mather@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "MASSI",
  firstName: "Massimo",
  lastName: "Michini",
  email: "massimo.michini@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "MBUFT",
  firstName: "Megan",
  lastName: "Bufton",
  email: "megan.bufton@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "MEWIL",
  firstName: "Mesha",
  lastName: "Lunt",
  email: "mesha.lunt@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "MICHT",
  firstName: "Michael",
  lastName: "Thomson",
  email: "michael.thomson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Scotland"
}, {
  id: "MJELMAN",
  firstName: "Mariama",
  lastName: "Jelman",
  email: "mariama.jelman@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "International"
}, {
  id: "MKALU",
  firstName: "Mwewa",
  lastName: "Kaluba",
  email: "mwewa.kaluba@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Digital Practice",
  specialty: "Digital Practice"
}, {
  id: "MKOLL",
  firstName: "Marion",
  lastName: "Kollen",
  email: "marion.kollen@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "MMIND",
  firstName: "Malina",
  lastName: "Mindru",
  email: "malina.mindru@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Dell"
}, {
  id: "MNIKO",
  firstName: "Mariana",
  lastName: "Nikolakaki",
  email: "mariana.nikolakaki@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "BU3"
}, {
  id: "MSTIR3",
  firstName: "Matthew",
  lastName: "Stirland",
  email: "matthew.stirland@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "NCART",
  firstName: "Nick",
  lastName: "Carter",
  email: "nick.carter@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU3"
}, {
  id: "NELIO",
  firstName: "Niamh",
  lastName: "Eliot",
  email: "niamh.eliot@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "OJOSH",
  firstName: "Omkar",
  lastName: "Joshi",
  email: "omkar.joshi@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "OMCAL",
  firstName: "Oliver",
  lastName: "Mcalary",
  email: "oliver.mcalary@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Careers",
  specialty: "Careers"
}, {
  id: "PJAMESON",
  firstName: "Phil",
  lastName: "Jameson",
  email: "phil.jameson@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "BU5"
}, {
  id: "PSHRI",
  firstName: "Paresh",
  lastName: "Shrigondekar",
  email: "paresh.shrigondekar@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "RBARD",
  firstName: "Rebecca",
  lastName: "Barden",
  email: "rebecca.barden@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "PST"
}, {
  id: "RCHAM",
  firstName: "Richard",
  lastName: "Chambers",
  email: "richard.chambers@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "RDIXO",
  firstName: "Rachel",
  lastName: "Dixon",
  email: "rachel.dixon@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Dell"
}, {
  id: "REONE",
  firstName: "Rebecca",
  lastName: "Jones",
  email: "rebecca.jones@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "RESCO",
  firstName: "Reece",
  lastName: "Scott",
  email: "reece.scott@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "RHETE",
  firstName: "Rheanna",
  lastName: "Tejura",
  email: "rheanna.tejura@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "OpenMind"
}, {
  id: "RLITT",
  firstName: "Rachel",
  lastName: "Little",
  email: "rachel.little@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Scotland"
}, {
  id: "RMCDO",
  firstName: "Rebecca",
  lastName: "Mcdonald",
  email: "rebecca.mcdonald@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "North"
}, {
  id: "ROCOL",
  firstName: "Rob",
  lastName: "Coles",
  email: "rob.coles@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "Global"
}, {
  id: "ROWAL",
  firstName: "Robert",
  lastName: "Walker",
  email: "robert.walker@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU3"
}, {
  id: "RPALM",
  firstName: "Rebecca",
  lastName: "Palmer",
  email: "rebecca.palmer@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "SBURT",
  firstName: "Sara",
  lastName: "Burton",
  email: "sara.burton@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "International"
}, {
  id: "SCORE",
  firstName: "Silvia",
  lastName: "Correia",
  email: "silvia.correia@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "B12"
}, {
  id: "SCROW",
  firstName: "Sammy",
  lastName: "Crow",
  email: "sammy.crow@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "Global"
}, {
  id: "SCUSH",
  firstName: "Steve",
  lastName: "Cushnan",
  email: "steve.cushnan@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "PST",
  specialty: "PST"
}, {
  id: "SHASL2",
  firstName: "Sam",
  lastName: "Haslam",
  email: "sam.haslam@essencemediacom.com",
  officeName: "MEDIACOM NORTH",
  securityGroup: "PRAPRGBY",
  businessUnit: "North"
}, {
  id: "SHIKP",
  firstName: "Shikha",
  lastName: "Patel",
  email: "shikha.patel@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "OpenMind"
}, {
  id: "SHSHA",
  firstName: "Shahyad",
  lastName: "Shahir",
  email: "shahyad.shahir@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "B12"
}, {
  id: "SLADA",
  firstName: "Steve",
  lastName: "Ladan",
  email: "steve.ladan@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "eCom"
}, {
  id: "SMEYER",
  firstName: "Sarah",
  lastName: "Hewitt",
  email: "sarah.hewitt@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "BU3",
  specialty: "B12"
}, {
  id: "SSWEE",
  firstName: "Sophie",
  lastName: "Sweetland",
  email: "sophie.sweetland@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "B12"
}, {
  id: "SZANO",
  firstName: "Simone",
  lastName: "Zanolla",
  email: "simone.zanolla@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "TEBUC",
  firstName: "Terry",
  lastName: "Buckingham",
  email: "terry.buckingham@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU3"
}, {
  id: "THODE",
  firstName: "Thomas",
  lastName: "Denman",
  email: "thomas.denman@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "OpenDoor"
}, {
  id: "TLATH",
  firstName: "Tom",
  lastName: "Latham",
  email: "tom.latham@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "BU3"
}, {
  id: "TLOON",
  firstName: "Tash",
  lastName: "Looney",
  email: "tash.looney@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "CCP",
  specialty: "CCP"
}, {
  id: "TMYLE",
  firstName: "Toby",
  lastName: "Myles",
  email: "toby.myles@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "TUDAL",
  firstName: "Tatjana",
  lastName: "Udalova",
  email: "tatjana.udalova@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPBMQS",
  businessUnit: "All"
}, {
  id: "VALDA",
  firstName: "Valentina",
  lastName: "Damiani",
  email: "valentina.damiani@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "OpenMind"
}, {
  id: "VIJMU",
  firstName: "Vijay",
  lastName: "Muthukrishnan",
  email: "vijay.muthukrishnan@groupm.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "OpenDoor"
}, {
  id: "VIOAN",
  firstName: "Vasiliki",
  lastName: "Ioannidou",
  email: "vasiliki.ioannidou@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Dell"
}, {
  id: "VLOUD",
  firstName: "Veronika",
  lastName: "Loudova",
  email: "veronika.loudova@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "WBLAN",
  firstName: "Will",
  lastName: "Blank",
  email: "will.blank@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRBUY",
  businessUnit: "International"
}, {
  id: "YNDLO",
  firstName: "Yolanda",
  lastName: "Ndlovu",
  email: "yolanda.ndlovu@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPRPO",
  businessUnit: "BU5"
}, {
  id: "YPAPA",
  firstName: "Yiota",
  lastName: "Papathoma",
  email: "yiota.papathoma@essencemediacom.com",
  officeName: "MEDIACOM",
  securityGroup: "PRAPROV",
  businessUnit: "Dell"
}].map(approver => ({
  ...approver,
  firstName: toTitleCase(approver.firstName),
  lastName: toTitleCase(approver.lastName),
  // Add the new companyUserIds field, defaulting to an empty array
  companyUserIds: companyUserIdsMap[approver.id] || []
}));

export const businessUnits = [...new Set(approversData.map(a => a.businessUnit).filter(bu => bu && (bu.startsWith('BU') || bu.startsWith('B12') || bu === 'All')))].sort();
export const clients = [...new Set(approversData.map(a => a.officeName))].filter(Boolean);

// Collect and export all unique Functions from businessUnit and specialty
const businessUnitFunctions = approversData
  .map(a => a.businessUnit)
  .filter(bu => bu && bu !== 'All' && !bu.startsWith('BU') && !bu.startsWith('B12'));
const specialtyFunctions = approversData
  .map(a => a.specialty)
  .filter(Boolean)
  // FIX: Exclude 'B12' from the functions list
  .filter(s => s !== 'B12');
export const functions = [...new Set([...businessUnitFunctions, ...specialtyFunctions])].sort();

// Collect and export all unique Company User IDs
const allCompanyUserIds = new Set(approversData.flatMap(approver => approver.companyUserIds));
const priorityOrder = ['NGMCALL', 'NGMCLON', 'NGMCINT', 'NGMCNOR'];
export const companyUserIdsList = [...allCompanyUserIds].sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);

    if (aIndex === -1 && bIndex === -1) {
        return a.localeCompare(b); // Both not in priority, sort alphabetically
    } else if (aIndex === -1) {
        return 1; // b is in priority, a is not
    } else if (bIndex === -1) {
        return -1; // a is in priority, b is not
    } else {
        return aIndex - bIndex; // Both are in priority, sort by their order
    }
});
