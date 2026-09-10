"use client";

import { useReducer, useState } from "react";
import { TimelineEvent, Timeline } from "../../../controller/types";
import { formatDurationCompact } from "../../../util/formatDuration";
import clsx from "clsx";

type LocalTimelineEvent = TimelineEvent & { currentLength: number };
type LocalTimeline = {
  name?: string;
  note?: string;
  currentOffset: number;
  events: LocalTimelineEvent[];
};

type TimelinesAction =
  | { type: "INIT"; localTimelines: LocalTimeline[] }
  | { type: "SET_OFFSET"; timelineIndex: number; offset: number }
  | {
      type: "SET_EVENT_DURATION";
      timelineIndex: number;
      eventIndex: number;
      duration: number;
    };

function parseTimelines(timelines: Timeline[]): LocalTimeline[] {
  return timelines.map((t) => ({
    name: t.name,
    note: t.note,
    currentOffset: t.default_offset || 0,
    events: t.events.map((e) => ({
      ...e,
      currentLength: e.defaultLength,
    })),
  }));
}

function timelinesReducer(
  state: LocalTimeline[],
  action: TimelinesAction,
): LocalTimeline[] {
  switch (action.type) {
    case "INIT":
      return action.localTimelines;
    case "SET_OFFSET": {
      const newTimelines = [...state];
      newTimelines[action.timelineIndex] = {
        ...newTimelines[action.timelineIndex],
        currentOffset: Math.max(0, action.offset),
      };
      return newTimelines;
    }
    case "SET_EVENT_DURATION": {
      const newTimelines = [...state];
      const timeline = newTimelines[action.timelineIndex];
      const newEvents = [...timeline.events];
      newEvents[action.eventIndex] = {
        ...newEvents[action.eventIndex],
        currentLength: action.duration,
      };
      newTimelines[action.timelineIndex] = { ...timeline, events: newEvents };
      return newTimelines;
    }
  }
}

// Durations are the recipe's material — set in mono tabular figures on quiet
// bench surfaces (the Working Bench signature move), with an ember focus ring.
const INPUT_BASE_STYLES =
  "font-mono tabular-nums text-xs px-1 py-0.5 rounded border bg-background text-foreground border-input outline-none focus:ring-2 focus:ring-ring focus:w-14 focus:min-w-14";
const INPUT_STANDARD_STYLES = `${INPUT_BASE_STYLES} w-14`;
const INPUT_ZERO_OFFSET_STYLES = `${INPUT_BASE_STYLES} absolute left-1/2 opacity-0 pointer-events-none group-focus-within:opacity-100 group-focus-within:pointer-events-auto z-50`;
const INPUT_ZOOM_STYLES =
  "font-mono tabular-nums text-sm px-2 py-1 rounded border bg-background text-foreground border-input outline-none focus:ring-2 focus:ring-ring w-16 text-center";

function DurationInput({
  value,
  onChange,
  min = 0,
  max,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  className: string;
  ariaLabel: string;
}) {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitInput = () => {
    const newValue = parseInt(inputValue, 10);
    if (!isNaN(newValue)) {
      let constrainedValue = Math.max(newValue, min);

      if (max !== undefined) {
        constrainedValue = Math.min(constrainedValue, max);
      }

      onChange(constrainedValue);
      setInputValue(constrainedValue.toString());
    } else {
      setInputValue(value.toString());
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      commitInput();
    }
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={inputValue}
      onChange={handleInputChange}
      onBlur={commitInput}
      onClick={commitInput}
      onKeyUp={handleKeyUp}
      className={className}
      aria-label={ariaLabel}
    />
  );
}

function ZoomInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (newValue: number) => void;
}) {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const commitInput = () => {
    const newValue = parseFloat(inputValue);
    if (!isNaN(newValue) && newValue >= 1) {
      onChange(newValue);
      setInputValue(newValue.toString());
    } else {
      setInputValue(value.toString());
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitInput();
    }
  };

  return (
    <label className="flex flex-col items-center print:hidden">
      <span className="mb-1 font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        Zoom
      </span>
      <input
        type="number"
        min={1}
        step={0.5}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={commitInput}
        onKeyUp={handleKeyUp}
        className={INPUT_ZOOM_STYLES}
        aria-label="Timeline zoom multiplier"
      />
    </label>
  );
}

function EventBlock({
  event,
  duration,
  onDurationChange,
  hasOverlap,
  maxDuration,
}: {
  event: LocalTimelineEvent;
  duration: number;
  onDurationChange: (newDuration: number) => void;
  hasOverlap?: boolean;
  maxDuration: number;
}) {
  const eventLabel = event.name || "Unnamed event";
  const isResizable =
    (event.minLength !== undefined || event.maxLength !== undefined) &&
    event.minLength !== event.maxLength;

  const durationText = formatDurationCompact(duration);
  const ariaLabel = isResizable
    ? `${eventLabel}: ${durationText} (resizable)${hasOverlap && event.activeTime ? " (overlap conflict)" : ""}`
    : `${eventLabel}: ${durationText}${hasOverlap && event.activeTime ? " (overlap conflict)" : ""}`;

  const widthPercent = (duration / maxDuration) * 100;

  return (
    <label
      className={clsx(
        // border-r takes its color from the base layer's `* { border-border }`;
        // the overlap state overrides it with a destructive edge.
        "relative h-full transition-colors border-r box-border focus-within:overflow-visible",
        {
          "bg-destructive/15 border-destructive text-foreground":
            hasOverlap && event.activeTime,
          "bg-primary/20 text-foreground": !hasOverlap && event.activeTime,
          "bg-muted text-muted-foreground": !event.activeTime,
        },
      )}
      style={{ width: `${widthPercent}%` }}
      role="article"
      aria-label={ariaLabel}
    >
      <div className="absolute inset-0 flex flex-col justify-center px-2 overflow-hidden">
        <div className="text-sm font-semibold truncate">{event.name}</div>
        {isResizable ? (
          <DurationInput
            value={duration}
            onChange={onDurationChange}
            min={event.minLength ?? 1}
            max={event.maxLength}
            className={INPUT_STANDARD_STYLES}
            ariaLabel={`${eventLabel} duration in minutes`}
          />
        ) : (
          <div className="font-mono tabular-nums text-xs opacity-75">
            {formatDurationCompact(duration)}
          </div>
        )}
      </div>
      {hasOverlap && event.activeTime && (
        <div className="absolute top-1 right-2 text-destructive text-xs font-bold">
          ⚠
        </div>
      )}
    </label>
  );
}

function OffsetBlock({
  offset,
  onOffsetChange,
  maxDuration,
}: {
  offset: number;
  onOffsetChange: (newOffset: number) => void;
  maxDuration: number;
}) {
  const handleLabelClick = (e: React.SyntheticEvent) => {
    const input = e.currentTarget.nextElementSibling as HTMLInputElement;
    if (input) {
      input.focus();
    }
  };

  const isZero = offset === 0;
  const offsetText = formatDurationCompact(offset);
  // Use minimum 1% width for zero offset to keep the clickable indicator visible
  const widthPercent = isZero ? 1 : (offset / maxDuration) * 100;

  if (isZero) {
    return (
      <label
        className="group relative h-full bg-muted/40 border-r box-border"
        style={{ width: `${widthPercent}%` }}
        role="article"
        aria-label={`Offset: ${offsetText}`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            onClick={handleLabelClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); // stop Space from scrolling
                handleLabelClick(e);
              }
            }}
            className="w-1 h-4 bg-muted-foreground rounded cursor-pointer hover:bg-foreground"
            role="button"
            aria-label="Set timeline offset"
            tabIndex={0}
          />
          <DurationInput
            value={offset}
            onChange={onOffsetChange}
            min={0}
            className={INPUT_ZERO_OFFSET_STYLES}
            ariaLabel="Timeline offset in minutes"
          />
        </div>
      </label>
    );
  }

  return (
    <label
      className="relative h-full bg-muted/40 border-r box-border"
      style={{ width: `${widthPercent}%` }}
      role="article"
      aria-label={`Offset: ${offsetText}`}
    >
      <div className="absolute inset-0 flex flex-col justify-center px-2 overflow-hidden">
        <div className="font-mono text-[0.65rem] uppercase tracking-wide opacity-60 truncate">
          Offset
        </div>
        <DurationInput
          value={offset}
          onChange={onOffsetChange}
          min={0}
          className={INPUT_STANDARD_STYLES}
          ariaLabel="Timeline offset in minutes"
        />
      </div>
    </label>
  );
}

function TimelineRow({
  timeline,
  onOffsetChange,
  onEventDurationChange,
  maxDuration,
  showOffset,
  overlappingEvents,
}: {
  timeline: LocalTimeline;
  onOffsetChange: (newOffset: number) => void;
  onEventDurationChange: (eventIndex: number, newDuration: number) => void;
  maxDuration: number;
  showOffset: boolean;
  overlappingEvents: Set<number>;
}) {
  const totalEventDuration = timeline.events.reduce(
    (acc, e) => acc + e.currentLength,
    0,
  );

  const durationText = formatDurationCompact(totalEventDuration);
  const timelineName = timeline.name || "Timeline";
  const timelineId = timeline.name
    ? `timeline-${timeline.name.replace(/\s+/g, "-").toLowerCase()}`
    : undefined;

  return (
    <div
      className="mb-4 last:mb-0"
      role="region"
      aria-label={`Timeline: ${timelineName}`}
    >
      <div className="flex flex-row justify-between items-center mb-1 gap-2">
        <div className="flex flex-col min-w-0">
          {timeline.name && (
            <h4 className="text-sm font-semibold truncate" id={timelineId}>
              {timeline.name}
            </h4>
          )}
          {timeline.note && (
            <p className="text-xs text-muted-foreground truncate">
              {timeline.note}
            </p>
          )}
        </div>
        <div
          className="font-mono tabular-nums text-xs text-muted-foreground shrink-0"
          aria-label={`${timelineName} duration: ${durationText}`}
        >
          Duration: {durationText}
        </div>
      </div>
      <div
        className="relative border border-border rounded bg-background h-16 w-full"
        role="group"
        aria-label={`${timelineName} events`}
      >
        <div className="absolute inset-0 flex flex-row">
          {showOffset && (
            <OffsetBlock
              offset={timeline.currentOffset}
              onOffsetChange={onOffsetChange}
              maxDuration={maxDuration}
            />
          )}
          {timeline.events.map((event, index) => (
            <EventBlock
              key={index}
              event={event}
              duration={event.currentLength}
              onDurationChange={(newDuration) =>
                onEventDurationChange(index, newDuration)
              }
              hasOverlap={overlappingEvents.has(index)}
              maxDuration={showOffset ? maxDuration : totalEventDuration}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TimelineView({ timelines }: { timelines: Timeline[] }) {
  const [localTimelines, dispatch] = useReducer(
    timelinesReducer,
    timelines,
    parseTimelines,
  );
  const [zoom, setZoom] = useState(1);

  const handleOffsetChange = (timelineIndex: number, newOffset: number) => {
    dispatch({ type: "SET_OFFSET", timelineIndex, offset: newOffset });
  };

  const handleEventDurationChange = (
    timelineIndex: number,
    eventIndex: number,
    newDuration: number,
  ) => {
    dispatch({
      type: "SET_EVENT_DURATION",
      timelineIndex,
      eventIndex,
      duration: newDuration,
    });
  };

  if (!timelines || timelines.length === 0) {
    return null;
  }

  const maxDuration = Math.max(
    ...localTimelines.map((t) => {
      const eventsDuration = t.events.reduce(
        (acc, e) => acc + e.currentLength,
        0,
      );
      return t.currentOffset + eventsDuration;
    }),
    1, // Ensure at least 1 to avoid division by zero
  );

  const maxDurationText = formatDurationCompact(maxDuration);

  const showOffsets = localTimelines.length > 1;

  // Calculate overlapping active events across timelines
  const overlappingEventsMap = new Map<number, Set<number>>();

  if (localTimelines.length > 1) {
    // Build a list of all active events with their time ranges
    const activeEvents: Array<{
      timelineIndex: number;
      eventIndex: number;
      startTime: number;
      endTime: number;
    }> = [];

    localTimelines.forEach((timeline, timelineIndex) => {
      let currentTime = timeline.currentOffset;
      timeline.events.forEach((event, eventIndex) => {
        if (event.activeTime) {
          activeEvents.push({
            timelineIndex,
            eventIndex,
            startTime: currentTime,
            endTime: currentTime + event.currentLength,
          });
        }
        currentTime += event.currentLength;
      });
    });

    // Check for overlaps
    for (let i = 0; i < activeEvents.length; i++) {
      for (let j = i + 1; j < activeEvents.length; j++) {
        const event1 = activeEvents[i];
        const event2 = activeEvents[j];

        // Check if events are from different timelines and overlap
        if (event1.timelineIndex !== event2.timelineIndex) {
          const overlaps =
            event1.startTime < event2.endTime &&
            event1.endTime > event2.startTime;

          if (overlaps) {
            // Mark both events as overlapping
            if (!overlappingEventsMap.has(event1.timelineIndex)) {
              overlappingEventsMap.set(event1.timelineIndex, new Set());
            }
            overlappingEventsMap
              .get(event1.timelineIndex)!
              .add(event1.eventIndex);

            if (!overlappingEventsMap.has(event2.timelineIndex)) {
              overlappingEventsMap.set(event2.timelineIndex, new Set());
            }
            overlappingEventsMap
              .get(event2.timelineIndex)!
              .add(event2.eventIndex);
          }
        }
      }
    }
  }

  return (
    <div className="mt-3 bg-card rounded-md border border-border">
      <div className="p-4">
        <div className="flex flex-row justify-between items-center mb-4 gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            Adjust timing
          </span>
          <div
            className="font-mono tabular-nums text-xs text-muted-foreground shrink-0"
            aria-label={`Maximum duration: ${maxDurationText}`}
          >
            Max {maxDurationText}
          </div>
        </div>
        <div
          className="overflow-x-auto"
          role="group"
          aria-label="Timeline container"
        >
          <div style={{ width: `${zoom * 100}%` }}>
            {localTimelines.map((timeline, index) => (
              <TimelineRow
                key={index}
                timeline={timeline}
                onOffsetChange={(newOffset) =>
                  handleOffsetChange(index, newOffset)
                }
                onEventDurationChange={(eventIndex, newDuration) =>
                  handleEventDurationChange(index, eventIndex, newDuration)
                }
                maxDuration={maxDuration}
                showOffset={showOffsets}
                overlappingEvents={overlappingEventsMap.get(index) || new Set()}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-row justify-between items-start mt-4 gap-4">
          <p className="text-xs text-muted-foreground">
            Edit the duration values to experiment with timing variations.
          </p>
          <ZoomInput value={zoom} onChange={setZoom} />
        </div>
      </div>
    </div>
  );
}
