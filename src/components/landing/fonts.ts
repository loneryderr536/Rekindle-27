import localFont from "next/font/local";

export const fredoka = localFont({
  src: "./fonts/fredoka-variable.woff2",
  weight: "400 700",
  variable: "--o26-fredoka",
  display: "swap",
});

export const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400" },
    { path: "./fonts/poppins-500.woff2", weight: "500" },
    { path: "./fonts/poppins-600.woff2", weight: "600" },
    { path: "./fonts/poppins-700.woff2", weight: "700" },
  ],
  variable: "--o26-poppins",
  display: "swap",
});
