"""Durable orchestrator — manages the round lifecycle.

Flow per round:
  1. Wait for each active player to submit an action (wait_for_external_event).
  2. Race: all submitted OR timeout timer fires (whichever first).
  3. Call activity chain: RAG query → search → narrative → state extract → broadcast.
  4. Persist new story state to Cosmos DB.
  5. Repeat for next round.
"""
import azure.durable_functions as df

# TODO: implement


def orchestrator_function(context: df.DurableOrchestrationContext):
    raise NotImplementedError


main = df.Orchestrator.create(orchestrator_function)
