import "@logseq/libs";

import { KernelManager, KernelMessage } from '@jupyterlab/services';
import { ServerConnection } from "@jupyterlab/services";
import { PageConfig } from '@jupyterlab/coreutils';

import {  BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";


function showJupyterError(msg: string, status: 'warning' | 'error', timeout?: number) {
  logseq.UI.showMsg(`
    [:div.p-2 
      [:h2.text-xl "logseq-jupyter"]
      [:div.p-2 "${msg}"]]
  `, status, { timeout: timeout ? timeout : 5000 });
}


async function serverInfoFromSettings() {
  if (logseq.settings === undefined) {
    // should not happen actually
    throw new Error('No settings given for logseq-jupyter plugin.')
  }

  if (!logseq.settings.jupyter_server_url) {
    throw new Error("Jupyter Server URL not set. Check your logseq-jupyter plugin settings.")
  }
  var url: URL;
  try {
    url = new URL(logseq.settings.jupyter_server_url);
  } catch (e) {
    throw new Error("Given Jupyter Server URL not valid. Check your logseq-jupyter plugin settings.") 
  }
  
  const baseUrl = url.origin;  // e.g. "http://localhost:8888"
  const token = url.searchParams.get('token');
  if (!(baseUrl && token)) {
    throw new Error("Given Jupyter Server URL not valid. Check your logseq-jupyter plugin settings.") 
  }
  return {baseUrl, token};
}


function extractCodeFromBlockContent(content: string): string | undefined {
  // TODO be less rigid on where to place "python"
  const codeRegex = /```\s+python\n(?<code>[\s\S]*?)\n```/m;
  return content.match(codeRegex)?.groups?.code;
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
    showJupyterError("Not able to select code", "warning");
    return;
  }

  serverInfoFromSettings().then(({baseUrl, token}) => {

    logseq.Editor.insertBlock(block.uuid, "", { before: false }).then(
      (newBlock: BlockEntity | null) => {

        if (newBlock === null) {
          showJupyterError("Not able to add output block", "error");
          return
        }

        var stream_output : Array<string> = [];
        var executionFinished: boolean = false;

        runJupyterCode(baseUrl, token, code, (msg: KernelMessage.IIOPubMessage) => {
          console.log(msg);
          if (KernelMessage.isStatusMsg(msg)) return;
          if (KernelMessage.isExecuteResultMsg(msg)) {
            stream_output.push(msg.content.data['text/plain'].toString());
            executionFinished = true;
          }
          if (KernelMessage.isErrorMsg(msg)) {
            stream_output.push(msg.content.evalue.toString());
            executionFinished = true;
          }
          if (KernelMessage.isStreamMsg(msg)){
            stream_output.push(msg.content.text);
          }

          var output = stream_output.join('');
          console.log(output);
          logseq.Editor.updateBlock(
            newBlock.uuid,
            `
              <div class="jupyter-output">${output}</div>
            `
          ).then(() => logseq.Editor.exitEditingMode())
        }); 
      }
    )

  }).catch(err => {
    console.log(err);
    showJupyterError(err, "error");
  })
}

async function main(): Promise<void> {
  // logseq.Editor.registerSlashCommand('jupyter', runJupyterCommand);
  const settings: SettingSchemaDesc[] = [
    {
      key: "jupyter_run_cell",
      description: "Keybinding to run a currently selected block as jupyter code cell",
      type: "string",
      default: "r c",
      title: "Run Block as Jupyter Cell",
    },
    {
      key: "jupyter_server_url",
      description: "URL to running Jupyter Server. Like http://{host}:{port}/?token={token}",
      type: "string",
      default: "",
      title: "Jupyter Server URL",
    }
  ];
  logseq.useSettingsSchema(settings);

  if (logseq.settings !== undefined) {
    logseq.App.registerCommandPalette(

      {
        key: "run_jupyter_cell",
        label: "Run Block as Jupyter Cell",
        keybinding : { binding: logseq.settings.jupyter_run_cell },
      },
      runJupyterCommand 
    )
  }
  
  logseq.provideStyle(`
    .jupyter-output {
        font-family:  "Fira Code", Monaco, Menlo, Consolas, "COURIER NEW", monospace;
    }
  `);
}

// bootstrap
logseq.ready(main).catch(console.error)
