function getElementTag(tag) {
	const html = [];
	const elements = document.getElementsByTagName(tag);
	for (let index = 0; index < elements.length; index++) {
		html.push(elements[index].outerHTML);
	}
	return html.join("\r\n");
}

class IframeTest {
	width = 814;
	height = 1143;
	enablePreview = true;
	containerRef = document.getElementById("iframeContainer");
	iframeEl;

	_printEl = document.getElementById("printEL");

	afterPrint = () => {
		this.iframeEl.contentWindow.parent.document.title = this._title;
	};
	beforePrint = () => {
		this.iframeEl.contentWindow.parent.document.title = this.printTitle;
	};

	refresh() {
		setTimeout(() => {
			this.render();
		}, 500);
	}
	print() {
		this.iframeEl.contentWindow.print();
	}

	render() {
		this.iframeEl = document.createElement("iframe");
		this.iframeEl.height = this.height + "";
		this.iframeEl.width = this.width + "";
		this.iframeEl.style.border = "1px solid #ccc";
		this.iframeEl.style.background = "#fff";

		if (this.containerRef) {
			this.containerRef.innerHTML = "";
			this.containerRef.appendChild(this.iframeEl);
		}

		if (this.iframeEl.contentWindow) {
			this.iframeEl.contentWindow.document.open();
			this.iframeEl.contentWindow.document.write(this.getTemplateStr());
			this.iframeEl.contentWindow.document.close();
			// chorme bug
			this.iframeEl.contentWindow.onbeforeprint = this.beforePrint;
			this.iframeEl.contentWindow.onafterprint = this.afterPrint;
		}
	}

	getTemplateStr() {
		const styles = getElementTag("style");
		const links = getElementTag("link");

		const scripts = `
            <!--paged.polyfill.min.js rendering is not normal. home page header is missing --> 
      
            <script src="../dist/paged.polyfill.js" type="text/javascript"></script>
            
           
            <script>
              class RepeatingTableHeaders extends Paged.Handler {
                constructor(chunker, polisher, caller) {
                  super(chunker, polisher, caller);
                }
    
                afterPageLayout(pageElement, page, breakToken, chunker) {
                  let tables = pageElement.querySelectorAll('table[data-split-from]');
                  tables.forEach((table) => {
                    let ref = table.dataset.ref;
                    let sourceTable = chunker.source.querySelector(
                      "[data-ref='" + ref + "']"
                    );
                    let header = sourceTable.querySelector('thead');
                    if (header) {
                      let clonedHeader = header.cloneNode(true);
                      table.insertBefore(clonedHeader, table.firstChild);
                    }
                  });
                }
              }
              Paged.registerHandlers(RepeatingTableHeaders);
            </script>
          `;

		const html = `
            <!DOCTYPE html>
            <html>
              <head>
              <meta charset="utf-8" />
              <title>1111</title>
    
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <link
                rel="preconnect"
                href="https://winkong-frontend.oss-cn-qingdao.aliyuncs.com"
              />
              ${links}
              <style>
                  ::-webkit-scrollbar {
                    width: 5px;
                    height: 5px;
                  }
                  ::-webkit-scrollbar-thumb {
                    background-color: #999;
                    -webkit-border-radius: 5px;
                    border-radius: 5px;
                  }
                  ::-webkit-scrollbar-thumb:vertical:hover {
                    background-color: #666;
                  }
                  ::-webkit-scrollbar-thumb:vertical:active {
                    background-color: #666;
                  }
                  ::-webkit-scrollbar-button {
                    display: none;
                  }
                  ::-webkit-scrollbar-track {
                    background-color: #f1f1f1;
                  }
              </style>
    
                ${styles}
                ${scripts}
              </head>
              <body>
                ${this._printEl.outerHTML}
              </body>
            </html>
          `;

		return html;
	}
}

const iframeTest = new IframeTest();
iframeTest.render();
function refresh() {
	iframeTest.refresh();
}
function print() {
	iframeTest.print();
}
