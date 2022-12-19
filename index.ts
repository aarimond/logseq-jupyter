import "@logseq/libs";

import { KernelManager, KernelMessage } from '@jupyterlab/services';
import { ServerConnection } from "@jupyterlab/services";
import { PageConfig } from '@jupyterlab/coreutils';


function extractCodeFromBlockContent(content: string): string | undefined {
  // TODO be less rigid on where to place "python"
  const codeRegex = /```\s+python\n(?<code>[\s\S]*?)\n```/m;
  return content.match(codeRegex)?.groups?.code;
}


function showJupyterError(msg: string, status: 'warning' | 'error', timeout?: number) {
  logseq.UI.showMsg(`
    [:div.p-2 
      [:h2.text-xl "logseq-jupyter"]
      [:div.p-2 "${msg}"]]
  `, status, { timeout: timeout ? timeout : 5000 });
}


async function runJupyterCode(baseUrl: string, token: string, code: string, kernelMessageHandler: (msg: KernelMessage.IIOPubMessage) => void) {
  PageConfig.setOption('baseUrl', baseUrl);
  PageConfig.setOption('token', token);

  const serverSettings = ServerConnection.makeSettings({
    appendToken: true
  });

  const kernelManager = new KernelManager({ serverSettings });
  const kernel = await kernelManager.startNew({ name: 'python' });

  const future = kernel.requestExecute({ code });

  future.onIOPub = kernelMessageHandler;

  await future.done;
  await kernel.shutdown();
}


async function runJupyterCommand() {
  const block = await logseq.Editor.getCurrentBlock();

  if (block === null) {
    showJupyterError('No Block selected.', 'warning');
    return;
  }

  const code = extractCodeFromBlockContent(block.content);
  if (code === undefined) {
    showJupyterError('Not able to select code', 'warning');
    return;
  }

  logseq.Editor.getBlockProperty(block.uuid, 'jupyter').then((jupyterProperty: string | null) => {

    if (!jupyterProperty) {
      showJupyterError("Not able to read property 'jupyter' from selected block.", 'warning');
      return;
    }

    const url = new URL(jupyterProperty);
    const baseUrl = url.origin;  // e.g. "http://localhost:8888"
    const token = url.searchParams.get('token');

    if (!(baseUrl && token)) {
      showJupyterError('Not able to read baseUrl and token from block properties.', 'error');
      return;
    }

    runJupyterCode(baseUrl, token, code, (msg: KernelMessage.IIOPubMessage) => {
      console.log(msg);
      var output;
      if (KernelMessage.isExecuteResultMsg(msg)) {
        output = msg.content.data['text/plain'];
        logseq.Editor.insertBlock(
          block.uuid,
          "``` shell\n#Output:\n" + output + "\n```\n", { before: false }
        ).then(
          () => logseq.Editor.exitEditingMode()
        );

      }
      if (KernelMessage.isErrorMsg(msg)) {
        output = msg.content.evalue; 
        logseq.Editor.insertBlock(
          block.uuid,
          "``` shell\n#Error:\n" + output + "\n```\n", { before: false }
        ).then(
          () => logseq.Editor.exitEditingMode()
        );
      }
    }); 

  }).catch(err => {
    console.log(err);
    showJupyterError('Problems reading properties from block.', 'error');
  })
}

async function main(): Promise<void> {
  logseq.Editor.registerSlashCommand('jupyter', runJupyterCommand);
}

// bootstrap
logseq.ready(main).catch(console.error)
