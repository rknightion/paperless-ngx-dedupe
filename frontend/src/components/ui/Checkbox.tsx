import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <input
        type="checkbox"
        className={cn(
          'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
          className
        )}
        ref={ref}
        {...props}
      />
      {props.checked && (
        <Check className="absolute top-0 left-0 h-4 w-4 text-primary-foreground pointer-events-none" />
      )}
    </div>
  )
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };