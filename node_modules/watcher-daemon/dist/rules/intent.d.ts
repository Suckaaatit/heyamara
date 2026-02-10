import { EventType } from './types';
export interface RuleIntent {
    eventTypes: EventType[];
    extensions: string[];
    pathIncludes: string[];
    count?: number;
    windowSeconds?: number;
}
export declare function extractIntent(condition: string): RuleIntent;
