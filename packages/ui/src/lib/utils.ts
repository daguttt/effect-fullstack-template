import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A utility function that enables Tailwind CSS class name autocompletion and formatting
 * through the Prettier plugin when used with tagged template literals in component templates.
 *
 * @example
 * // Using with tagged template literals for Tailwind classes in React Select components
 * <Input
 *   containerClassName={tw`border-cyan-3 hover:shadow-uniform focus-within:border-cyan-3 bg-cyan-3 placeholder:text-cyan-1 hover:border-gray-2 text-cyan-1 h-[40px] rounded-4xl border-[1.5px] duration-250 hover:bg-white`}
 * />
 */
export function tw(strings: TemplateStringsArray, ...values: string[]) {
  return String.raw({ raw: strings }, ...values);
}
