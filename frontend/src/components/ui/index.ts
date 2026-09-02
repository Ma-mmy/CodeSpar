/**
 * CodeSpar 组件层统一出口。
 *
 * 页面一律从 '@/components/ui' 引入，不要直接 import Radix primitives，
 * 也不要在页面里手写玻璃样式 —— 所有视觉决策收敛在这一层。
 */

export { Button, buttonVariants, type ButtonProps } from './button'
export { Field, Input, Label, Textarea, controlBase } from './field'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select'
export { Checkbox, OptionCard, RadioGroup, RadioGroupItem, Switch } from './toggles'
export { Slider } from './slider'
export {
  Alert,
  Badge,
  EmptyState,
  Progress,
  Separator,
  Skeleton,
  Spinner,
  badgeVariants,
} from './feedback'
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
export { ToastProvider, useToast } from './toast'
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipProvider,
} from './disclosure'
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'
export { GlassCard, PageContainer, PageHeader } from '../GlassCard'
