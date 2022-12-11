# logseq-jupyter

Run code from logseq in Jupyter Kernels

This is experimental.

## Installation

``` shell
# clone repo
git clone https://github.com/aarimond/logseq-jupyter.git

# or
git clone git@github.com:aarimond/logseq-jupyter.git

cd logseq-jupyter

# requires Node and npm to be installed
npm install
npm run build
```

Then in logseq
- open `Plugins`
- open `Load unpacked plugin`
- select `logseq-jupyter` folder


## Usage

- Annotate the block with a `jupyter` property which contains the URL, including the token 
- The `jupyter` command will starting a python kernel, execute the code within the code snippet, retrieve the output, and shut down the kernel again.

![GIF](https://github.com/aarimond/logseq-jupyter/blob/main/usage.gif?raw=true)

