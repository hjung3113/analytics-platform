import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useI18n } from '@ap/kernel';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@ap/ui';
import { boardPrototypeCopy, type BoardPrototypeQuestion, type BoardPrototypeVariant } from './boardPrototype';

const VARIANTS: readonly BoardPrototypeVariant[] = ['A', 'B', 'C'];
const QUESTIONS: readonly BoardPrototypeQuestion[] = ['height', 'empty', 'chips'];

export function BoardPrototypeSwitcher({
  enabled, question, variant, onQuestionChange, onVariantChange,
}: {
  enabled: boolean;
  question: BoardPrototypeQuestion;
  variant: BoardPrototypeVariant;
  onQuestionChange: (question: BoardPrototypeQuestion) => void;
  onVariantChange: (variant: BoardPrototypeVariant) => void;
}) {
  const { lang } = useI18n();
  const text = boardPrototypeCopy(lang);
  const step = useCallback((direction: -1 | 1) => {
    const index = VARIANTS.indexOf(variant);
    onVariantChange(VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length]);
  }, [variant, onVariantChange]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('button, a, input, textarea, select, [role="separator"], [role="menu"], [role="menuitem"], [role="radio"], [role="tab"]'))) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, step]);

  if (!enabled) return null;
  return <nav aria-label={text.chooseQuestion} data-board-prototype-switcher
    className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-subtle bg-surface-popover px-2 py-1 shadow-md">
    <Button type="button" variant="ghost" size="icon-sm" aria-label={text.previousVariant} onClick={() => step(-1)}>
      <ChevronLeft className="size-4" aria-hidden />
    </Button>
    <span aria-live="polite" className="min-w-40 text-center text-xs font-medium text-text-primary">
      {variant} · {text.variants[question][variant]}
    </span>
    <Button type="button" variant="ghost" size="icon-sm" aria-label={text.nextVariant} onClick={() => step(1)}>
      <ChevronRight className="size-4" aria-hidden />
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" aria-label={text.chooseQuestion}>
          {text.questions[question]}<ChevronDown className="ml-1 size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {QUESTIONS.map(item => <DropdownMenuItem key={item} onSelect={() => onQuestionChange(item)}>
          {item === question && <Check className="mr-2 size-3.5" aria-hidden />}
          {text.questions[item]}
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </nav>;
}
