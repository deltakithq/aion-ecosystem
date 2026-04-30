import { AgentBuilder } from "@deltakit/aion/agent";
import { Message, UserContent } from "@deltakit/aion/completion";
import { OpenAIClient } from "@deltakit/aion/providers";

const client = OpenAIClient.fromEnv();
const agentModel = client.completionModel("gpt-5");
const agent = new AgentBuilder("agent", agentModel)
  .instructions("Summarize attached documents in concise bullets.")
  .build();

// Document content parts include a URL, MIME type, and optional filename.
const response = await agent
  .prompt(
    Message.user([
      UserContent.text("Summarize this PDF."),
      UserContent.documentUrl(
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        "application/pdf",
        { filename: "dummy.pdf" },
      ),
    ]),
  )
  .send();

console.log(response.output);
