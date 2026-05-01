import { Activity, Bot, List, type LucideIcon, MessageSquare } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

export function NavButton(props: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  const Icon = navIcon(props.icon);
  return (
    <Button
      className={cn(
        "h-8 min-h-8 w-full justify-start gap-2 rounded-md border-transparent bg-transparent px-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-accent hover:text-sidebar-foreground [&_svg]:h-4 [&_svg]:w-4",
        props.active &&
          "border-primary/10 bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      variant="ghost"
      type="button"
      onClick={props.onClick}
    >
      <Icon />
      <span>{props.label}</span>
    </Button>
  );
}

type IconName = "activity" | "bot" | "list" | "message";

function navIcon(name: IconName): LucideIcon {
  switch (name) {
    case "activity":
      return Activity;
    case "bot":
      return Bot;
    case "list":
      return List;
    case "message":
      return MessageSquare;
  }
}
