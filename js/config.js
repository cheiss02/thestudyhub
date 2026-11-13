/* =====================================================================
   The Study Hub — settings
   This is the file to edit for everyday changes. No other code needed.
   ===================================================================== */

window.STUDYHUB = {
  // From Supabase: Project Settings → API Keys.
  // The PUBLISHABLE key (sb_publishable_...) is made to be public: it only lets
  // the website talk to the database, and the security rules in supabase/setup.sql
  // decide what each person can see. NEVER put a secret key (sb_secret_...) in this file.
  SUPABASE_URL: 'https://ekjyotgllvleiupzawog.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_9AUy56bHB-IRN0RojUr3gw_8rWw4boK',

  SITE_URL: 'https://thestudyhub.us',
  CLUB_EMAIL: 'help@thestudyhub.us',
  INSTAGRAM: 'https://www.instagram.com/the_studyhub1/',

  // Turn on after Google sign-in is set up in Supabase (see README).
  GOOGLE_LOGIN: false,

  // School days shown on the schedule. 1 = Monday ... 5 = Friday.
  DAYS: [
    { dow: 1, name: 'Mon' },
    { dow: 2, name: 'Tue' },
    { dow: 3, name: 'Wed' },
    { dow: 4, name: 'Thu' },
    { dow: 5, name: 'Fri' },
  ],

  // Session start times, 24-hour clock. Each session is about 30 minutes.
  TIMES: ['15:30', '16:00', '16:30', '17:00', '17:30', '18:00'],

  // How many weeks ahead families can book (this week + next week = 2).
  WEEKS_AHEAD: 2,

  LANGUAGES: ['Spanish', 'Mandarin', 'Cantonese', 'Vietnamese', 'Korean', 'Arabic', 'Tagalog', 'Armenian', 'Farsi'],
  SUBJECTS: ['Reading', 'Writing', 'Math', 'Science', 'Spelling'],
  KID_GRADES: ['TK', 'K', '1st', '2nd', '3rd', '4th', '5th'],
  TUTOR_GRADES: ['9th', '10th', '11th', '12th'],
  MAX_PHOTOS: 6,
};
