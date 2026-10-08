import type { TemplatePayload } from './template-validators';

/** Owner-requested introductions. Selecting one opens a review form; it never sends. */
export const SHALIMAR_INTRO_TEMPLATES: {
  label: string;
  payload: TemplatePayload;
}[] = [
  {
    label: 'English introduction',
    payload: {
      name: 'shalimar_store_introduction_en',
      language: 'en',
      category: 'Marketing',
      header_type: 'image',
      header_media_url:
        'https://crm.shalimarfashions.com/brand/shalimar-store-introduction.png',
      body_text:
        'Welcome to Shalimar Fashions, Ernakulam!\n\nExplore our clothing collections. Reply to this message for sizes, prices and availability.\n\nVisit us: Ground Floor, near CSB Bank, Market Road, Ernakulam, Kochi 682011.\nShop: +91 70256 48555\nWhatsApp: +91 70253 20333\n\nTo stop these updates, reply STOP.',
      footer_text: 'Shalimar Fashions',
      buttons: [
        {
          type: 'PHONE_NUMBER',
          text: 'Call the shop',
          phone_number: '+917025648555',
        },
      ],
    },
  },
  {
    label: 'മലയാളം പരിചയപ്പെടുത്തൽ',
    payload: {
      name: 'shalimar_store_introduction_ml',
      language: 'ml',
      category: 'Marketing',
      header_type: 'image',
      header_media_url:
        'https://crm.shalimarfashions.com/brand/shalimar-store-introduction.png',
      body_text:
        'ശാലിമാർ ഫാഷൻസിലേക്ക് സ്വാഗതം!\n\nഞങ്ങളുടെ വസ്ത്രശേഖരങ്ങൾ പരിചയപ്പെടാം. സൈസ്, വില, ലഭ്യത എന്നിവ അറിയാൻ ഈ സന്ദേശത്തിന് മറുപടി നൽകൂ.\n\nവിലാസം: ഗ്രൗണ്ട് ഫ്ലോർ, CSB ബാങ്കിന് സമീപം, മാർക്കറ്റ് റോഡ്, എറണാകുളം, കൊച്ചി 682011.\nഷോപ്പ്: +91 70256 48555\nWhatsApp: +91 70253 20333\n\nഇത്തരം അറിയിപ്പുകൾ വേണ്ടെങ്കിൽ STOP എന്ന് മറുപടി നൽകൂ.',
      footer_text: 'Shalimar Fashions',
      buttons: [
        {
          type: 'PHONE_NUMBER',
          text: 'വിളിക്കൂ',
          phone_number: '+917025648555',
        },
      ],
    },
  },
];
