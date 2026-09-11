"use client";

import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MagicWand } from "@phosphor-icons/react/dist/csr/MagicWand";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_TEXT } from "@/lib/consent";
import { leadFieldsSubmitSchema, type LeadFields } from "@/lib/schemas";
import { Field } from "./field";

type Props = {
  /** What the scan read, or all-empty if the rep chose to type it in. */
  initialFields: LeadFields;
  rawText: string;
  /** True when the fields came from a scan rather than an empty form. */
  fromScan: boolean;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (fields: LeadFields, rawText: string) => void;
};

export function ReviewStep({
  initialFields,
  rawText,
  fromScan,
  saving,
  error,
  onBack,
  onSubmit,
}: Props) {
  const [consented, setConsented] = useState(false);
  const [text, setText] = useState(rawText);

  const form = useForm<LeadFields>({
    // The same schema the server enforces, so the rep can never be shown a
    // form that passes here and is rejected by /api/leads.
    resolver: zodResolver(leadFieldsSubmitSchema) as Resolver<LeadFields>,
    defaultValues: initialFields,
    mode: "onBlur",
  });

  const { register, handleSubmit, formState } = form;
  const errors = formState.errors;

  return (
    <form
      onSubmit={handleSubmit((fields) => onSubmit(fields, text))}
      className="fade-up rounded-[14px] border border-line bg-surface p-[22px] shadow-card"
      noValidate
    >
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <h2 className="text-[16.5px] font-extrabold tracking-[-0.01em]">Contact details</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[11.5px] font-extrabold text-warn">
          <PencilSimple size={13} weight="bold" />
          Draft
        </span>
      </div>

      {fromScan && (
        <div className="mb-[18px] flex items-start gap-2.5 rounded-[10px] border border-[#d7e3fb] bg-brand-soft px-3.5 py-3 text-[13px] text-[#1e3a8a]">
          <MagicWand size={17} weight="bold" className="mt-px shrink-0" />
          <p>We filled these in from the card. Anything we could not read is blank — please check before saving.</p>
        </div>
      )}

      <div className="grid gap-[15px] sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName?.message}>
          {(a) => <Input {...a} {...register("firstName")} autoComplete="given-name" placeholder="e.g. Rohan" />}
        </Field>

        <Field label="Last name" required error={errors.lastName?.message}>
          {(a) => <Input {...a} {...register("lastName")} autoComplete="family-name" placeholder="e.g. Deshmukh" />}
        </Field>

        <Field
          label="Company"
          error={errors.company?.message}
          help="Saved as “[Not provided]” if you leave it blank."
        >
          {(a) => <Input {...a} {...register("company")} autoComplete="organization" placeholder="Company name" />}
        </Field>

        <Field label="Job title" error={errors.title?.message}>
          {(a) => (
            <Input {...a} {...register("title")} autoComplete="organization-title" placeholder="e.g. Head of Procurement" />
          )}
        </Field>

        <Field label="Email" error={errors.email?.message} help="Email or phone — at least one.">
          {(a) => (
            <Input
              {...a}
              {...register("email")}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="name@company.com"
            />
          )}
        </Field>

        <Field label="Phone" error={errors.phone?.message}>
          {(a) => (
            <Input {...a} {...register("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" />
          )}
        </Field>

        <Field label="Website" error={errors.website?.message} className="sm:col-span-2">
          {(a) => <Input {...a} {...register("website")} inputMode="url" autoComplete="url" placeholder="company.com" />}
        </Field>

        <Field label="Street" error={errors.street?.message} className="sm:col-span-2">
          {(a) => (
            <Input {...a} {...register("street")} autoComplete="street-address" placeholder="Building, street, suite" />
          )}
        </Field>

        <Field label="City" error={errors.city?.message}>
          {(a) => <Input {...a} {...register("city")} autoComplete="address-level2" placeholder="City" />}
        </Field>

        <Field label="State" error={errors.state?.message}>
          {(a) => <Input {...a} {...register("state")} autoComplete="address-level1" placeholder="State or region" />}
        </Field>

        <Field label="Postal code" error={errors.postalCode?.message}>
          {(a) => <Input {...a} {...register("postalCode")} autoComplete="postal-code" placeholder="Postcode" />}
        </Field>

        <Field label="Country" error={errors.country?.message}>
          {(a) => <Input {...a} {...register("country")} autoComplete="country-name" placeholder="Country" />}
        </Field>
      </div>

      <details className="mt-[18px] rounded-[10px] border border-line bg-surface-2 px-3.5 py-3">
        <summary className="cursor-pointer text-[12.5px] font-extrabold">Card text</summary>
        <p className="mt-1.5 text-xs text-subtle">
          Everything we read off the card. Saved to the lead so an admin can check a field that looks wrong.
        </p>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          className="mono mt-2 text-[13px]"
          aria-label="Card text"
        />
      </details>

      {/* The gate. Not sent to Salesforce — it exists so the rep asks. */}
      <label className="mt-[18px] flex cursor-pointer items-start gap-3 rounded-[10px] border border-line-strong bg-surface p-3.5">
        <Checkbox
          checked={consented}
          onCheckedChange={(value) => setConsented(value === true)}
          className="mt-0.5"
          aria-describedby="consent-text"
        />
        <span id="consent-text" className="text-[13px] leading-relaxed font-semibold">
          {CONSENT_TEXT}
        </span>
      </label>

      {error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2.5 rounded-[10px] border border-bad/20 bg-bad-soft px-3.5 py-3 text-[13px] font-bold text-bad"
        >
          <WarningCircle size={17} weight="bold" className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" size="tap" onClick={onBack} disabled={saving} className="sm:w-auto">
          Back
        </Button>
        <Button type="submit" size="tap" className="flex-1" disabled={!consented || saving}>
          {saving ? "Saving…" : "Save lead"}
        </Button>
      </div>

      {!consented && (
        <p className="mt-2 text-center text-xs text-subtle">Tick the consent box to save this lead.</p>
      )}
    </form>
  );
}
