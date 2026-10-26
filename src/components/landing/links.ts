/**
 * Where the landing page's navigation goes. The design also has Line-up and Key dates pages;
 * until those exist they point at the "Plan your night" cards on this page.
 */
export const LINKS = {
  home: "#o26-story",
  about: "#rekindle",
  lineup: "#plan",
  dates: "#plan",
  faq: "#faq",
  register: "/register",
} as const;

export const LOGO = { src: "/landing/logo.png", width: 360, height: 410 } as const;
