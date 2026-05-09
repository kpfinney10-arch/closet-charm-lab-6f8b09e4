import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Construction className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Coming up next</p>
            <p className="text-sm text-muted-foreground">
              This screen ships in the next phase of the build.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
