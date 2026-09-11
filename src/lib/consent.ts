/**
 * What the rep confirms before a lead can be saved.
 *
 * Shown verbatim next to the checkbox. It is a gate only: the app does not
 * write consent to Salesforce (see the Salesforce contract in CLAUDE.md), so
 * this text exists to make the rep ask the question at the booth rather than
 * to create a record.
 *
 * Changing the wording is a legal decision, not a copy edit.
 */
export const CONSENT_TEXT =
  "I asked this person for permission to store their details, and they agreed to be contacted about ThinkVibes products and services.";
