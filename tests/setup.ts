// Registers the jest-dom matchers (toBeDisabled, toBeInTheDocument, …) for
// component tests. The dependency was already declared but never wired up -
// there were no component tests at all, only domain-level ones.
import '@testing-library/jest-dom/vitest';
