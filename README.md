# Dexter

A risk-focused financial research agent for traditional markets and crypto.

## Overview

Dexter is an autonomous research agent that prioritizes **robustness over prediction**. It analyzes markets through the lens of risk, volatility, and tail events—challenging fragile narratives rather than reinforcing them.

**Philosophy:**
- Fat tails and black swans matter more than normal distributions
- What can go wrong eventually will—focus on survivability
- Consensus narratives often mask fragility
- Volatility is information, not just noise

**Coverage:**
- Traditional finance: equities, bonds, commodities, derivatives
- Crypto: tokens, DeFi protocols, stablecoins

## Setup

### Prerequisites

- Node.js (v18+)
- xAI API key
- Perplexity API key

### Installation

```bash
git clone https://github.com/virattt/dexter.git
cd dexter
npm install
```

### Configuration

```bash
cp env.example .env
```

Edit `.env` and add your API keys:
```
XAI_API_KEY=your-xai-api-key
PERPLEXITY_API_KEY=your-perplexity-api-key
```

### Usage

```bash
npm run dev
```

## Example Queries

- "What are the tail risks for NVIDIA at current valuations?"
- "Analyze Bitcoin's correlation with risk assets during stress events"
- "What hidden leverage exists in the current market structure?"
- "Compare the liquidity profile of SOL vs ETH"
- "What could break the soft landing narrative?"

## Architecture

Built on [LangGraph](https://langchain-ai.github.io/langgraph/) with a ReAct agent pattern:

1. **Research**: Fetches real-time data via Perplexity
2. **Analysis**: Synthesizes information with risk-first framing
3. **Response**: Delivers insights focused on robustness and tail risks

## License

MIT
