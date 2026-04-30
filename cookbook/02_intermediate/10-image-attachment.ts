import { AgentBuilder } from "@deltakit/aion/agent";
import { Message, UserContent } from "@deltakit/aion/completion";
import { OpenRouterClient } from "@deltakit/aion/providers";

const client = OpenRouterClient.fromEnv();
const agentModel = client.completionModel("google/gemini-3.1-flash-lite-preview");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Answer visual questions briefly.")
  .build();

// Multimodal prompts combine text with image content parts.
const response = await agent
  .prompt(
    Message.user([
      UserContent.text("What is shown in this image?"),
      UserContent.imageUrl(
        "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg",
        {
          detail: "auto",
        },
      ),
    ]),
  )
  .send();

console.log(response.output);
