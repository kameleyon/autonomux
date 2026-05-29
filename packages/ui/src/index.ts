/**
 * @autonomux/ui — shared UI primitives.
 *
 * Token-driven, warm-only palette, WCAG 2.2 AA on every primitive.
 *
 * Usage:
 *   import "@autonomux/ui/tokens.css";  // once at the app root
 *   import "@autonomux/ui/Button.css";  // per-primitive CSS (or bundle them)
 *   import { Button } from "@autonomux/ui";
 */

export { Button } from "./Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button/Button";

export { Card } from "./Card/Card";
export type {
  CardProps,
  CardPadding,
  CardVariant,
  CardTag,
} from "./Card/Card";

export { Form, useFormContext } from "./Form/Form";
export type {
  FormProps,
  FormContextValue,
  FormErrorEntry,
} from "./Form/Form";
export { Field } from "./Form/Field";
export type { FieldProps } from "./Form/Field";

export { Input } from "./Input/Input";
export type { InputProps, InputVariant } from "./Input/Input";

export { Select } from "./Select/Select";
export type { SelectProps, SelectVariant } from "./Select/Select";

export { Dialog } from "./Dialog/Dialog";
export type { DialogProps, DialogRole } from "./Dialog/Dialog";

export { Chip } from "./Chip/Chip";
export type { ChipProps, ChipVariant } from "./Chip/Chip";

export { SkipLink } from "./SkipLink/SkipLink";
export type { SkipLinkProps } from "./SkipLink/SkipLink";

export { Nav } from "./Nav/Nav";
export type { NavProps, NavLink, NavAuthState } from "./Nav/Nav";

export { Footer } from "./Footer/Footer";
export type { FooterProps, FooterColumn, FooterLink } from "./Footer/Footer";

export { EmptyState } from "./EmptyState/EmptyState";
export type {
  EmptyStateProps,
  EmptyStateCta,
  HeadingLevel,
} from "./EmptyState/EmptyState";
