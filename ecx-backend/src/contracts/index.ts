/**
 * The shared contract. Every module imports from here — never from another module's internals.
 * Changing anything here is a coordination event (BACKEND_WORKPLAN.md §5).
 */
export * from './primitives';
export * from './policy';
export * from './payment-intent';
export * from './orchestrator';
export * from './events';
