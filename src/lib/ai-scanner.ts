/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI SAFETY SCANNER — SkillBridge CRM Local Rule Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 100-rule content scanner for chat messages.
 * Runs entirely server-side with regex — ZERO API calls, ZERO cost.
 *
 * Categories:
 *   A. Email Detection (R1–R10)
 *   B. Phone Number Detection (R11–R22)
 *   C. Links & URLs (R23–R32)
 *   D. Social Media & Messaging (R33–R47)
 *   E. Payment & Finance (R48–R62)
 *   F. Contact Bypass Phrases (R63–R77)
 *   G. Obfuscation & Encoding (R78–R89)
 *   H. Bio / Profile Redirects (R90–R94)
 *   I. Freelance & Business Platforms (R95–R98)
 *   J. Meeting & Scheduling (R99–R100)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface ScanRule {
  id: string;
  name: string;
  regex: RegExp;
  replacement: string;
}

export interface ScanResult {
  censored: string;
  wasModerated: boolean;
  violations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. EMAIL DETECTION (R1–R10)
// ═══════════════════════════════════════════════════════════════════════════════

const emailRules: ScanRule[] = [
  {
    id: "R1",
    name: "Direct Email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R2",
    name: "Spelled Email (at/dot)",
    regex: /\b[a-zA-Z0-9._%+-]+\s*(?:\[?\(?\s*at\s*\)?\]?)\s*[a-zA-Z0-9.-]+\s*(?:\[?\(?\s*dot\s*\)?\]?)\s*(?:com|net|org|in|co|io|me|info|biz|us|uk|edu|gov)\b/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R3",
    name: "Email With Spaces Around @",
    regex: /\b[a-zA-Z0-9._%+-]+\s+@\s+[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}\b/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R4",
    name: "Email Provider Name + Username",
    regex: /\b(?:gmail|yahoo|hotmail|outlook|protonmail|proton|zoho|aol|icloud|yandex|mail\.com|rediffmail|tutanota|fastmail|gmx)\s*(?:id|mail|account|address|me)?\s*(?:is|:|[-–])?\s*[a-zA-Z0-9._%+-]+/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R5",
    name: "Reverse Email Provider Mention",
    regex: /\b[a-zA-Z0-9._%+-]+\s*(?:on|at|@)?\s*(?:gmail|yahoo|hotmail|outlook|protonmail|proton|zoho|aol|icloud|yandex|rediffmail|tutanota|fastmail|gmx)\b/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R6",
    name: "Mail Me / Email Me Phrase",
    regex: /\b(?:mail me|email me|e-mail me|send me (?:a |an )?(?:mail|email|e-mail)|drop (?:a |an )?(?:mail|email)|write me (?:a |an )?(?:mail|email)|send (?:mail|email) to)\b/gi,
    replacement: "[⚠ Blocked Email Attempt]",
  },
  {
    id: "R7",
    name: "My Email/Mail/ID Is",
    regex: /\b(?:my (?:email|e-mail|mail|id|address) (?:is|:)|(?:email|e-mail|mail|id) (?:id|address)?:\s*)[a-zA-Z0-9._%+@\-\s]+/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R8",
    name: "Domain TLD Mentions (contextual)",
    regex: /\b[a-zA-Z0-9._-]+\s*(?:\[?\(?\s*dot\s*\)?\]?)\s*(?:com|net|org|co|in|io|me|info|biz|edu|gov)\b/gi,
    replacement: "[⚠ Blocked Email/Domain]",
  },
  {
    id: "R9",
    name: "Unicode @ Symbol Variants",
    regex: /[a-zA-Z0-9._%+-]+[\uFF20\u0040\uFE6B][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    replacement: "[⚠ Blocked Email]",
  },
  {
    id: "R10",
    name: "Encoded Email Separators",
    regex: /\b[a-zA-Z0-9._%+-]+\s*(?:\{at\}|\(at\)|\[at\]|<at>|«at»|'at'|"at"|#at#|_at_|-at-|\*at\*)\s*[a-zA-Z0-9.-]+\s*(?:\{dot\}|\(dot\)|\[dot\]|<dot>|«dot»|'dot'|"dot"|#dot#|_dot_|-dot-|\*dot\*)\s*[a-zA-Z]{2,}/gi,
    replacement: "[⚠ Blocked Email]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// B. PHONE NUMBER DETECTION (R11–R22)
// ═══════════════════════════════════════════════════════════════════════════════

const phoneRules: ScanRule[] = [
  {
    id: "R11",
    name: "Standard Phone Format",
    regex: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,5}\)?[\s.-]?\d{3,5}[\s.-]?\d{3,5}/g,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R12",
    name: "International Code + Number",
    regex: /\+\s*(?:91|1|44|61|971|86|81|82|49|33|39|34|55|52|7|90|966|20|27|234|254|62|60|65|63|880|92|94|977|95)\s*[-.\s]?\d[\d\s.\-]{6,}/g,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R13",
    name: "Spelled Numbers (English) 6+",
    regex: new RegExp(
      `(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|oh)[\\s,.-]*){6,}`,
      "gi"
    ),
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R14",
    name: "Spelled Numbers (Hindi) 6+",
    regex: new RegExp(
      `(?:(?:shunya|ek|do|teen|char|chaar|paanch|panch|chhe|cheh|saat|sat|aath|aat|nau|noh|das)[\\s,.-]*){6,}`,
      "gi"
    ),
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R15",
    name: "Mixed Digit-Word Patterns",
    regex: /(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|\d)[\s,.-]*){7,}/gi,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R16",
    name: "Separated Single Digits 7+",
    regex: /(?:\d[\s.\-\/,|_*#~]*){7,}/g,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R17",
    name: "Phonetic Alphabet Numbers",
    regex: /(?:(?:wun|too|tree|fower|fifer|sixer|seven|ait|niner|zero)[\s,.-]*){6,}/gi,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R18",
    name: "Spelled Country Code",
    regex: /\b(?:plus\s*(?:ninety[\s-]*one|nine[\s-]*one|forty[\s-]*four|one|sixty[\s-]*one|eighty[\s-]*six))\s*[\s,.-]*(?:\d[\s.\-,]*){6,}/gi,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R19",
    name: "My Number/Phone/Mobile Is",
    regex: /\b(?:my (?:number|phone|mobile|cell|landline|contact|fone|ph|mob)\s*(?:number|no|#)?\s*(?:is|:))\b/gi,
    replacement: "[⚠ Blocked Phone Attempt]",
  },
  {
    id: "R20",
    name: "Call/Text This Number",
    regex: /\b(?:call|text|ring|dial|reach|contact)\s*(?:me\s*)?(?:at|on|@)?\s*(?:this\s*)?(?:number|no|#)\b/gi,
    replacement: "[⚠ Blocked Phone Attempt]",
  },
  {
    id: "R21",
    name: "Digits In Brackets/Parens",
    regex: /(?:\(\d{2,5}\)|\[\d{2,5}\]|\{\d{2,5}\})[\s.-]*\d{3,5}[\s.-]*\d{3,5}/g,
    replacement: "[⚠ Blocked Phone]",
  },
  {
    id: "R22",
    name: "Phone With Hash/Star Seps",
    regex: /\d+[*#]+\d+[*#]+\d+(?:[*#]+\d+)*/g,
    replacement: "[⚠ Blocked Phone]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// C. LINKS & URLs (R23–R32)
// ═══════════════════════════════════════════════════════════════════════════════

const linkRules: ScanRule[] = [
  {
    id: "R23",
    name: "External HTTP/HTTPS Links",
    regex: /https?:\/\/(?!drive\.google\.com)[a-zA-Z0-9\-._~:\/?#[\]@!$&'()*+,;=%]+/gi,
    replacement: "[⚠ Blocked Link - Only Google Drive Allowed]",
  },
  {
    id: "R24",
    name: "Bare Domains (no http)",
    regex: /(?<!\w)(?!drive\.google\.com)[a-zA-Z0-9-]+\.(?:com|net|org|io|co|in|me|info|biz|us|uk|edu|gov|co\.in|co\.uk|com\.au|xyz|app|dev|site|online|store|shop|tech|ai|gg|tv|cc|pro|club|live|world|space|fun|top|win|vip|work|one|link|click|page)\b/gi,
    replacement: "[⚠ Blocked Link]",
  },
  {
    id: "R25",
    name: "URL Shorteners",
    regex: /\b(?:bit\.ly|tinyurl|goo\.gl|t\.co|is\.gd|v\.gd|buff\.ly|ow\.ly|rb\.gy|shorturl|short\.io|cutt\.ly|rebrand\.ly|bl\.ink|snip\.ly|tiny\.cc|lnk\.to|s\.id|qr\.ae|t\.me)\b[\/a-zA-Z0-9._-]*/gi,
    replacement: "[⚠ Blocked Shortened Link]",
  },
  {
    id: "R26",
    name: "IP Addresses",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g,
    replacement: "[⚠ Blocked IP Address]",
  },
  {
    id: "R27",
    name: "WWW Prefix Domains",
    regex: /\bwww\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[\/a-zA-Z0-9._~:\/?#@!$&'()*+,;=%-]*/gi,
    replacement: "[⚠ Blocked Link]",
  },
  {
    id: "R28",
    name: "File Sharing Platforms",
    regex: /\b(?:dropbox|wetransfer|we\s*transfer|mega\.nz|mega\.io|mediafire|zippyshare|sendspace|file\.io|transfer\.sh|gofile|anonfiles|catbox|pixeldrain|uploadhaven)\b[\/:\s]*[a-zA-Z0-9._\/?#=-]*/gi,
    replacement: "[⚠ Blocked File Sharing Link]",
  },
  {
    id: "R29",
    name: "Cloud Storage (Non-Drive)",
    regex: /\b(?:onedrive|sharepoint|box\.com|icloud|pcloud|sync\.com|nextcloud|owncloud|backblaze|wasabi)\b[\/:\s]*[a-zA-Z0-9._\/?#=-]*/gi,
    replacement: "[⚠ Blocked Cloud Storage Link]",
  },
  {
    id: "R30",
    name: "Protocol Handlers",
    regex: /\b(?:tel|mailto|sms|whatsapp|tg|viber|skype|facetime|callto|webcal):[a-zA-Z0-9._%+\-@\/\s]+/gi,
    replacement: "[⚠ Blocked Protocol Link]",
  },
  {
    id: "R31",
    name: "Domain Spelled Out",
    regex: /\b[a-zA-Z0-9-]+\s*(?:dot|\.)\s*(?:com|net|org|io|in|co|me|info)\s*(?:slash|\/)\s*[a-zA-Z0-9._\-]+/gi,
    replacement: "[⚠ Blocked Link]",
  },
  {
    id: "R32",
    name: "QR Code / Scan Me Mentions",
    regex: /\b(?:scan (?:this|my|the) (?:qr|code|barcode)|qr\s*code|scan\s*me|scan to (?:connect|contact|pay|add)|here(?:'s| is) (?:a |my )?(?:qr|code))\b/gi,
    replacement: "[⚠ Blocked QR/Code Attempt]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// D. SOCIAL MEDIA & MESSAGING (R33–R47)
// ═══════════════════════════════════════════════════════════════════════════════

const socialRules: ScanRule[] = [
  {
    id: "R33",
    name: "@ Social Handle",
    regex: /@[a-zA-Z0-9_.]{2,}/g,
    replacement: "[⚠ Blocked Social Handle]",
  },
  {
    id: "R34",
    name: "Instagram / Insta / IG",
    regex: /\b(?:instagram|insta|ig)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R35",
    name: "Telegram / TG",
    regex: /\b(?:telegram|tg|t\.me)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R36",
    name: "WhatsApp / WA",
    regex: /\b(?:whatsapp|whats\s*app|wa\.me|watsapp|whtsapp)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/+\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R37",
    name: "Snapchat / Snap",
    regex: /\b(?:snapchat|snap\s*chat|snap)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R38",
    name: "Discord",
    regex: /\b(?:discord)\b[\s:@\-]*[a-zA-Z0-9@_.#\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R39",
    name: "Twitter / X",
    regex: /\b(?:twitter|x\.com|tweet)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R40",
    name: "TikTok",
    regex: /\b(?:tiktok|tik\s*tok)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R41",
    name: "Facebook / FB / Messenger",
    regex: /\b(?:facebook|fb|messenger|fb\.com|m\.me)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R42",
    name: "LinkedIn",
    regex: /\b(?:linkedin|linked\s*in)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R43",
    name: "YouTube / YT (non-task context)",
    regex: /\b(?:my\s*)?(?:youtube|yt)\s*(?:channel|handle|id|is|:)\s*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R44",
    name: "Reddit / Threads / Kik",
    regex: /\b(?:reddit|threads|kik)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R45",
    name: "Signal / Skype / Viber / WeChat / Line",
    regex: /\b(?:signal|skype|viber|wechat|we\s*chat|line\s*app|line\s*id)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R46",
    name: "Pinterest / Tumblr / Twitch / Clubhouse",
    regex: /\b(?:pinterest|tumblr|twitch|clubhouse)\b[\s:@\-]*[a-zA-Z0-9@_.\/\-]*/gi,
    replacement: "[⚠ Blocked Social Info]",
  },
  {
    id: "R47",
    name: "Gaming Platforms (Steam, PSN, Xbox, Epic)",
    regex: /\b(?:steam|steam\s*id|psn|playstation|xbox\s*(?:live|gt|gamertag)?|epic\s*(?:games|id)?|riot\s*id|battle\.net|battlenet|origin\s*id|uplay)\b[\s:@\-]*[a-zA-Z0-9@_.#\/\-]*/gi,
    replacement: "[⚠ Blocked Gaming ID]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// E. PAYMENT & FINANCE (R48–R62)
// ═══════════════════════════════════════════════════════════════════════════════

const paymentRules: ScanRule[] = [
  {
    id: "R48",
    name: "Payment Action Words",
    regex: /\b(?:pay me|pay you|paying|paid|make (?:a )?payment|send (?:the )?payment|receive payment|collect payment)\b/gi,
    replacement: "[⚠ Blocked Payment]",
  },
  {
    id: "R49",
    name: "Invoice & Billing Terms",
    regex: /\b(?:invoice|invoices|invoicing|billing|billed|bill me|bill you|send (?:the |an )?invoice|raise (?:an )?invoice|generate invoice)\b/gi,
    replacement: "[⚠ Blocked Billing]",
  },
  {
    id: "R50",
    name: "Banking Terms",
    regex: /\b(?:bank|banking|bank account|savings account|current account|bank transfer|wire transfer|wire me|bank details|bank name)\b/gi,
    replacement: "[⚠ Blocked Banking]",
  },
  {
    id: "R51",
    name: "Indian Payment Systems",
    regex: /\b(?:upi|neft|imps|rtgs|bhim|rupay|upi\s*id|vpa|ifsc|ifsc\s*code|micr)\b/gi,
    replacement: "[⚠ Blocked Payment Info]",
  },
  {
    id: "R52",
    name: "International Payment Platforms",
    regex: /\b(?:paypal|stripe|venmo|zelle|wise|transferwise|western union|moneygram|remitly|worldremit|skrill|neteller|payoneer|square|klarna|afterpay)\b/gi,
    replacement: "[⚠ Blocked Payment Platform]",
  },
  {
    id: "R53",
    name: "Indian Payment Apps",
    regex: /\b(?:gpay|google\s*pay|phonepe|phone\s*pe|paytm|razorpay|cred|freecharge|mobikwik|airtel\s*money|jio\s*pay|amazon\s*pay)\b/gi,
    replacement: "[⚠ Blocked Payment App]",
  },
  {
    id: "R54",
    name: "Cryptocurrency Terms",
    regex: /\b(?:crypto|cryptocurrency|bitcoin|btc|ethereum|eth|usdt|tether|litecoin|ltc|solana|sol|dogecoin|doge|xrp|ripple|cardano|ada|polkadot|bnb|binance|coinbase|metamask|defi|nft|blockchain|mining|staking|token|altcoin|shitcoin)\b/gi,
    replacement: "[⚠ Blocked Crypto]",
  },
  {
    id: "R55",
    name: "Currency Symbols & Names",
    regex: /\b(?:dollars?|rupees?|rupay|usd|inr|eur|gbp|aud|cad|jpy|cny|sgd|aed|sar|bdt|pkr|lkr|npr)\b|[$₹€£¥₿]/gi,
    replacement: "[⚠ Blocked Currency]",
  },
  {
    id: "R56",
    name: "Card Types & Numbers",
    regex: /\b(?:visa|mastercard|amex|american express|maestro|discover|diners club|card number|card no|cvv|expiry|expiration)\b/gi,
    replacement: "[⚠ Blocked Card Info]",
  },
  {
    id: "R57",
    name: "Account Identifiers",
    regex: /\b(?:account number|acc\s*(?:no|num|number)|a\/c|ifsc|routing number|iban|swift code|swift|sort code|bsb|clabe)\b/gi,
    replacement: "[⚠ Blocked Account Info]",
  },
  {
    id: "R58",
    name: "Transaction Terms",
    regex: /\b(?:deposit|withdraw|withdrawal|refund|payout|cashback|transaction|remittance|settlement|disbursement|reimbursement|escrow)\b/gi,
    replacement: "[⚠ Blocked Transaction Term]",
  },
  {
    id: "R59",
    name: "Financial Amounts",
    regex: /(?:[$₹€£¥]|rs\.?|inr|usd)\s*\d[\d,.\s]*|\d[\d,.]*\s*(?:dollars?|rupees?|rs|k|lac|lacs|lakh|lakhs|cr|crore|crores|grand|bucks)\b/gi,
    replacement: "[⚠ Blocked Amount]",
  },
  {
    id: "R60",
    name: "Rate Negotiation Phrases",
    regex: /\b(?:how much (?:do you|will you|would you)|what(?:'s| is| are) (?:your|the) (?:rate|price|charge|fee|cost)|your charges|your rate|your fees|my rate is|i charge|my fees|quote me|send (?:a |the )?quote|price list|rate card)\b/gi,
    replacement: "[⚠ Blocked Negotiation]",
  },
  {
    id: "R61",
    name: "Send/Transfer Money Phrases",
    regex: /\b(?:send money|transfer (?:money|funds|amount)|money transfer|fund transfer|pay (?:directly|cash|advance)|advance payment|down payment|partial payment|full payment|final payment|pending payment|remaining (?:payment|amount|balance))\b/gi,
    replacement: "[⚠ Blocked Payment Phrase]",
  },
  {
    id: "R62",
    name: "Crypto Wallet Addresses",
    regex: /\b(?:0x[a-fA-F0-9]{40}|bc1[a-zA-Z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}|r[0-9a-zA-Z]{24,34}|T[a-zA-Z0-9]{33})\b/g,
    replacement: "[⚠ Blocked Crypto Address]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// F. CONTACT BYPASS PHRASES (R63–R77)
// ═══════════════════════════════════════════════════════════════════════════════

const contactBypassRules: ScanRule[] = [
  {
    id: "R63",
    name: "Contact/Reach Me",
    regex: /\b(?:contact me|reach me|get in touch|get hold of me)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R64",
    name: "Call/Text Me",
    regex: /\b(?:call me|text me|ring me|dial me|buzz me|beep me)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R65",
    name: "DM/PM/Inbox Me",
    regex: /\b(?:dm me|pm me|inbox me|msg me|message me|direct message)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R66",
    name: "HMU / Hit Me Up",
    regex: /\b(?:hit me up|hmu|holler at me|slide into (?:my )?dms?)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R67",
    name: "My Details / Info Is",
    regex: /\b(?:my (?:number|email|id|handle|contact|details|info|address)\s*(?:is|are|:))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R68",
    name: "Send/Give Me Your Details",
    regex: /\b(?:send me your|give me your|share your|pass me your|drop your)\s*(?:number|email|id|handle|contact|details|info|phone|mobile)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R69",
    name: "Add/Find Me On",
    regex: /\b(?:add me on|find me on|follow me on|connect (?:with me )?on|look me up on)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R70",
    name: "Let's Talk On / Outside Platform",
    regex: /\b(?:let'?s talk on|lets talk on|let'?s chat on|lets chat on|let'?s move to|lets move to|let'?s switch to|lets switch to|continue (?:on|this on|over|outside)|take this (?:to|on|outside|off))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R71",
    name: "Talk Privately / Directly / Outside",
    regex: /\b(?:talk (?:privately|directly|outside|offline|elsewhere)|speak (?:privately|directly|outside|offline)|chat (?:privately|directly|outside|offline)|discuss (?:privately|directly|outside|offline))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R72",
    name: "Drop Me A Text/Line/Mail",
    regex: /\b(?:drop me a (?:text|message|mail|line|msg|dm|ping)|shoot me a (?:text|message|mail|dm)|send me a (?:text|message|mail|dm|ping))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R73",
    name: "Outside Platform Mention",
    regex: /\b(?:outside (?:this|the) (?:platform|app|chat|system|tool|website|site|dashboard)|off[\s-]?platform|off[\s-]?app|off[\s-]?site|go (?:around|outside|off) (?:the )?(?:platform|app|system))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R74",
    name: "Meet/Available On",
    regex: /\b(?:meet me on|available on|catch me on|find me at|reach out (?:to me )?on|i(?:'m| am) on)\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R75",
    name: "Personal Contact Request",
    regex: /\b(?:personal (?:number|email|id|contact|phone|mobile)|private (?:number|email|id|contact|chat)|direct (?:number|email|contact|line))\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R76",
    name: "I'll Share / Here's My",
    regex: /\b(?:i'?ll (?:share|send|give|drop|pass) (?:you )?my|here(?:'s| is) my|sharing my|let me (?:share|send|give|drop) (?:you )?my)\s*(?:number|email|id|handle|contact|details|info|phone|mobile|address)?\b/gi,
    replacement: "[⚠ Blocked Contact Attempt]",
  },
  {
    id: "R77",
    name: "Let's Connect / Work Directly",
    regex: /\b(?:let'?s connect|lets connect|connect directly|work directly|deal directly|directly deal|direct deal|cut(?:ting)? (?:the )?middleman|bypass (?:the )?(?:platform|app|system)|without (?:the )?(?:platform|app|middleman))\b/gi,
    replacement: "[⚠ Blocked Direct Deal]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// G. OBFUSCATION & ENCODING (R78–R89)
// ═══════════════════════════════════════════════════════════════════════════════

const obfuscationRules: ScanRule[] = [
  {
    id: "R78",
    name: "Leet-speak Contact Words",
    regex: /\b(?:em[@a4]il|ph[0o]ne|c[4a]ll\s*m[3e]|wh[4a]ts?\s*[a@4]pp|p[@a4]yp[@a4]l|str[1i!]pe|t[3e]l[3e]gr[@a4]m|[1i!]nst[@a4]gr[@a4]m|d[1i!]sc[0o]rd|f[@a4]c[3e]b[0o]{2}k|sn[@a4]pch[@a4]t|tw[1i!]tt[3e]r)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R79",
    name: "Spaced-Out Contact Words",
    regex: /(?:e\s+m\s+a\s+i\s+l|p\s+h\s+o\s+n\s+e|w\s+h\s+a\s+t\s+s\s*a\s*p\s*p|p\s+a\s+y\s*m?\s*e?\s*n?\s*t?|c\s+a\s+l\s+l|t\s+e\s+x\s+t|n\s+u\s+m\s+b\s+e\s+r|c\s+o\s+n\s+t\s+a\s+c\s+t)/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R80",
    name: "Dot-Separated Words",
    regex: /\b(?:e\.m\.a\.i\.l|p\.h\.o\.n\.e|c\.a\.l\.l|t\.e\.x\.t|n\.u\.m\.b\.e\.r|c\.o\.n\.t\.a\.c\.t)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R81",
    name: "Dash-Separated Words",
    regex: /\b(?:e-m-a-i-l|p-h-o-n-e|c-a-l-l|t-e-x-t|n-u-m-b-e-r|c-o-n-t-a-c-t|w-h-a-t-s-a-p-p)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R82",
    name: "Underscore-Separated Words",
    regex: /\b(?:e_m_a_i_l|p_h_o_n_e|c_a_l_l|t_e_x_t|n_u_m_b_e_r|c_o_n_t_a_c_t|w_h_a_t_s_a_p_p)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R83",
    name: "Star/Asterisk Obfuscation",
    regex: /\b(?:em\*+il|ph\*+ne|c\*ll|wh\*ts\*pp|p\*yp\*l|numb\*r|cont\*ct|t\*xt)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R84",
    name: "Vowel Removal (Abbreviations)",
    regex: /\b(?:phn|eml|cntct|whtspp|tlgrm|dscrd|fcbk|snpcht|twttr|pymnt|nmber|cll|txt)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R85",
    name: "Repeated Letters Obfuscation",
    regex: /\b(?:e+m+a+i+l+l*|p+h+o+n+e+|c+a+l+l+|w+h+a+t+s+a+p+p+|n+u+m+b+e+r+){2,}\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R86",
    name: "Reversed Sensitive Words",
    regex: /\b(?:liame|enohp|llac|txet|rebmun|tcatnoc|ppastahw|margolet|margatsni|drocsiD)\b/gi,
    replacement: "[⚠ Blocked Reversed Word]",
  },
  {
    id: "R87",
    name: "Pig Latin Sensitive Words",
    regex: /\b(?:emailay|onephay|allcay|exttay|umbernay|ontactcay|aborday|atscay)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R88",
    name: "Bracket/Paren Inside Words",
    regex: /\b(?:e\(m\)ail|ph\(o\)ne|nu\(m\)ber|con\(t\)act|c\(a\)ll|wh\(a\)tsapp|pa\(y\)pal)\b/gi,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
  {
    id: "R89",
    name: "Mixed Case / CaMeL Bypass Phrases",
    regex: /\b(?:cOnTaCt|EmAiL|pHoNe|nUmBeR|wHaTsApP|tElEgRaM|iNsTaGrAm|dIsCoRd|pAyPaL|cAlL)\b/g,
    replacement: "[⚠ Blocked Obfuscated Info]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// H. BIO / PROFILE REDIRECTS (R90–R94)
// ═══════════════════════════════════════════════════════════════════════════════

const bioRedirectRules: ScanRule[] = [
  {
    id: "R90",
    name: "Check My Bio/Profile",
    regex: /\b(?:check (?:my|the|out my) (?:bio|profile|about|about me|description|desc))\b/gi,
    replacement: "[⚠ Blocked Profile Redirect]",
  },
  {
    id: "R91",
    name: "Link In Bio/Description",
    regex: /\b(?:link in (?:my )?(?:bio|profile|desc|description|about)|bio link|profile link|link (?:is )?in (?:my )?(?:bio|profile|desc))\b/gi,
    replacement: "[⚠ Blocked Profile Redirect]",
  },
  {
    id: "R92",
    name: "Visit My Page/Website",
    regex: /\b(?:visit (?:my|the|our) (?:profile|page|website|site|blog|portfolio|link|channel)|go to my (?:profile|page|website|site|blog|portfolio|link))\b/gi,
    replacement: "[⚠ Blocked Profile Redirect]",
  },
  {
    id: "R93",
    name: "See My Profile/About",
    regex: /\b(?:see (?:my|the) (?:profile|about|bio|page|website|portfolio)|look at my (?:profile|about|bio|page|website|portfolio))\b/gi,
    replacement: "[⚠ Blocked Profile Redirect]",
  },
  {
    id: "R94",
    name: "Google Me / Search For Me",
    regex: /\b(?:google me|search (?:for )?me|look me up|search my name|google my name|find me online)\b/gi,
    replacement: "[⚠ Blocked Profile Redirect]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// I. FREELANCE & BUSINESS PLATFORMS (R95–R98)
// ═══════════════════════════════════════════════════════════════════════════════

const freelanceRules: ScanRule[] = [
  {
    id: "R95",
    name: "Freelance Platforms",
    regex: /\b(?:fiverr|upwork|freelancer|toptal|guru\.com|peopleperhour|99designs|designcrowd|envato|contra|malt|bark|thumbtack|taskrabbit|handy)\b/gi,
    replacement: "[⚠ Blocked Freelance Platform]",
  },
  {
    id: "R96",
    name: "Direct Deal / Cut Middleman",
    regex: /\b(?:direct deal|deal directly|work directly|hire me directly|hire directly|skip (?:the )?(?:platform|middleman|agency)|without (?:the )?(?:platform|middleman|agency)|cut (?:the )?(?:platform|middleman|agency)|go around (?:the )?(?:platform|middleman|agency)|no middleman|bypass fees|avoid (?:the )?(?:platform|fees|commission)|save (?:the )?commission)\b/gi,
    replacement: "[⚠ Blocked Direct Deal]",
  },
  {
    id: "R97",
    name: "Portfolio / Resume / CV Mention",
    regex: /\b(?:my portfolio|check (?:my |out my )?portfolio|portfolio (?:link|site|page|website|url)|my resume|my cv|curriculum vitae|my website is|my site is|my blog is)\b/gi,
    replacement: "[⚠ Blocked Portfolio Redirect]",
  },
  {
    id: "R98",
    name: "Business Card / Visiting Card",
    regex: /\b(?:business card|visiting card|here(?:'s| is) my card|i'?ll send (?:you )?(?:my )?card|contact card|vcard|v-card)\b/gi,
    replacement: "[⚠ Blocked Contact Card]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// J. MEETING & SCHEDULING (R99–R100)
// ═══════════════════════════════════════════════════════════════════════════════

const meetingRules: ScanRule[] = [
  {
    id: "R99",
    name: "Video Call / Meeting Platforms",
    regex: /\b(?:zoom|google meet|gmeet|teams|microsoft teams|ms teams|webex|cisco webex|jitsi|whereby|around\.co|gather\.town|loom|screen share|video call|facetime)\b[\s:@\-\/]*[a-zA-Z0-9@_.\/?#=-]*/gi,
    replacement: "[⚠ Blocked Meeting Platform]",
  },
  {
    id: "R100",
    name: "Schedule / Book Call Phrases",
    regex: /\b(?:schedule (?:a )?(?:call|meeting|video|session|chat)|book (?:a )?(?:call|meeting|session|slot|time)|set up (?:a )?(?:call|meeting|session)|arrange (?:a )?(?:call|meeting)|hop on (?:a )?(?:call|meeting|zoom|video)|jump on (?:a )?(?:call|meeting|zoom|video)|let'?s (?:hop|jump|get) on (?:a )?(?:call|zoom|video|meet)|calendly|cal\.com|doodle)\b/gi,
    replacement: "[⚠ Blocked Meeting Request]",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_RULES: ScanRule[] = [
  ...emailRules,
  ...phoneRules,
  ...linkRules,
  ...socialRules,
  ...paymentRules,
  ...contactBypassRules,
  ...obfuscationRules,
  ...bioRedirectRules,
  ...freelanceRules,
  ...meetingRules,
];

/**
 * Run the AI Safety Scanner against a message.
 * Returns the censored text, whether it was moderated, and which rules fired.
 */
export function scanMessage(text: string): ScanResult {
  let censored = text;
  let wasModerated = false;
  const violations: string[] = [];

  for (const rule of ALL_RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(censored)) {
      rule.regex.lastIndex = 0;
      censored = censored.replace(rule.regex, rule.replacement);
      wasModerated = true;
      violations.push(`${rule.id}:${rule.name}`);
    }
  }

  return { censored, wasModerated, violations };
}

/** Total rule count — exported for dashboard display */
export const RULE_COUNT = ALL_RULES.length;
