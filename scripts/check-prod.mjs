// Fails if an instance is about to go public without the details the legal pages need.
const missing = [];
if (!process.env.NEXT_PUBLIC_CONTACT_EMAIL) missing.push("NEXT_PUBLIC_CONTACT_EMAIL (shown on Privacy, Terms and Security)");
if (process.env.ALLOW_CUSTOM_BASE_URL === "true") missing.push("ALLOW_CUSTOM_BASE_URL must not be true on a public server");
if (missing.length) {
  console.error("Not ready for production:\n- " + missing.join("\n- "));
  process.exit(1);
}
console.log("Production checks passed.");
