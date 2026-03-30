"use client";

import { StageHeader } from "@/components/stage-header";
import type { TrackingStatItem } from "@/components/tracking-stat";

type StageMetaBarProps = {
  title: string;
  trackingItems: TrackingStatItem[];
  deadlineAt: string | null;
};

export function StageMetaBar({
  title,
  trackingItems,
  deadlineAt,
}: StageMetaBarProps) {
  return <StageHeader deadlineAt={deadlineAt} title={title} trackingItems={trackingItems} />;
}
