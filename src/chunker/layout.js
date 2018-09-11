import { getBoundingClientRect } from "../utils/utils";
import {
  walk,
  nodeAfter,
  stackChildren,
  rebuildAncestors,
  needsBreakBefore,
  needsBreakAfter,
  needsPreviousBreakAfter,
  needsPageBreak
} from "../utils/dom";
import EventEmitter from "event-emitter";
import Hook from "../utils/hook";
const _requestIdleCallback = 'requestIdleCallback' in window ? requestIdleCallback : requestAnimationFrame;

const PER_PAGE_CHECK = 4;

/**
 * Layout
 * @class
 */
class Layout {

  constructor(element, wrapper, hooks) {
    this.element = element;
    this.wrapper = wrapper;

    let space = this.element.getBoundingClientRect();
    this.width = Math.round(space.width);

    if (hooks) {
      this.hooks = hooks;
    } else {
      this.hooks = {};
      this.hooks.renderNode = new Hook();
      this.hooks.layoutNode = new Hook();
      this.hooks.overflow = new Hook();
    }
  }

  getStart(content, breakToken) {
    let start = content;
    let node = breakToken.node;

    if (node) {
      start = node;
    }

    return start;
  }

  isContainer(node) {
    let container;

    if (typeof node.tagName === "undefined") {
      return true;
    }

    if (node.style.display === "none") {
      return false;
    }

    switch (node.tagName) {
      // Inline
      case "A":
      case "ABBR":
      case "ACRONYM":
      case "B":
      case "BDO":
      case "BIG":
      case "BR":
      case "BUTTON":
      case "CITE":
      case "CODE":
      case "DFN":
      case "EM":
      case "I":
      case "IMG":
      case "INPUT":
      case "KBD":
      case "LABEL":
      case "MAP":
      case "OBJECT":
      case "Q":
      case "SAMP":
      case "SCRIPT":
      case "SELECT":
      case "SMALL":
      case "SPAN":
      case "STRONG":
      case "SUB":
      case "SUP":
      case "TEXTAREA":
      case "TIME":
      case "TT":
      case "VAR":
      // Content
      case "P":
      case "H1":
      case "H2":
      case "H3":
      case "H4":
      case "H5":
      case "H6":
      case "FIGCAPTION":
      case "BLOCKQUOTE":
      case "PRE":
      case "LI":
      case "TR":
      case "DT":
      case "DD":
      case "VIDEO":
      case "CANVAS":
        container = false;
        break;
      default:
        container = true;
    }

    return container;
  }

  layout(space, content, styleMap, edges, breakToken) {
    let start = content;
    if (breakToken.node) {
      start = this.getStart(content, breakToken);
    }

    let walker = walk(start, content);

    let node;
    let done;
    let next;
    let offset = 0;
    let hasOverflow = false;
    let hasContent = false;
    let newBreakToken;
    let after;

    let check = 0;

    let dest = document.createDocumentFragment();

    let rendered;
    let shallow = true;

    while (!done && !hasOverflow) {
      next = walker.next();
      node = next.value;
      done = next.done;

      if (node) {
        this.hooks.layoutNode.trigger(node);

        // Check if the rendered element has a breakBefore set
        if (hasContent && (needsBreakBefore(node) || needsPreviousBreakAfter(node) || needsPageBreak(node))) {
          // Check for overflow
          hasOverflow = this.hasOverflow();

          if (hasOverflow) {
            let overflow = this.overflow(this.element);

            if (overflow) {

              newBreakToken = this.findBreakToken(overflow, content);

              if (newBreakToken && newBreakToken.node) {
                this.removeOverflow(overflow);
              }

              break;

            }
          } else {
            // Break layout with current node
            newBreakToken = {
              node: node,
              offset: 0
            };
            break;
          }
        }

        shallow = this.isContainer(node);

        rendered = this.render(node, this.wrapper, breakToken, shallow);

        if (!hasContent) {
          // Only register visible content
          if (rendered.nodeType === 1 && window.getComputedStyle(rendered).display !== "none") {
            hasContent = true;
          } else if (rendered.nodeType === 3 &&
              rendered.textContent.trim().length &&
              window.getComputedStyle(rendered.parentNode).display !== "none") {
            hasContent = true;
          }
        }

        if (!shallow) {
          after = nodeAfter(node, content);
          walker = walk(after, content);
        }


      } else {
        check = 1000; // Force check
      }

      // Only check every 4 elements
      if (check >= PER_PAGE_CHECK) {
        check = 0;
        hasOverflow = this.hasOverflow();
      }

      if (hasOverflow) {

        let overflow = this.overflow(this.element);

        if (overflow) {

          newBreakToken = this.findBreakToken(overflow, content);

          if (newBreakToken && newBreakToken.node) {
            this.removeOverflow(overflow);
          }

          break;

        } else {
          // Underflow
          hasOverflow = false;
        }

      }

      check += 1;
    }

    _requestIdleCallback(() => {
      this.listened = this.listeners();
    })


    return newBreakToken;

  }

  hasOverflow() {
    let width = Math.max(Math.floor(this.wrapper.getBoundingClientRect().width), this.element.scrollWidth);
    return this.width < width;
  }

  render(node, dest, breakToken, shallow=true, rebuild=true) {

    let clone = this.createDOMNode(node, !shallow);

    this.hooks.renderNode.trigger(clone);

    if (node.parentNode && node.parentNode.nodeType === 1) {
      let parent = dest.querySelector("[data-ref='" + node.parentNode.getAttribute("data-ref") + "']");

      // Rebuild chain
      if (parent) {
        parent.appendChild(clone);
      } else if (rebuild) {
        let fragment = rebuildAncestors(node);
        parent = fragment.querySelector("[data-ref='" + node.parentNode.getAttribute("data-ref") + "']");
        if (breakToken && breakToken.node.nodeType === 3 && breakToken.offset > 0) {
          clone.textContent = clone.textContent.substring(breakToken.offset);
          parent.appendChild(clone);
        } else {
          parent.appendChild(clone);
        }

        dest.appendChild(fragment);
      } else {
        dest.appendChild(clone);
      }


    } else {
      dest.appendChild(clone);
    }

    // if (!shallow && node.childNodes) {
    //   for (let child of node.childNodes) {
    //     this.render(child, dest, breakToken, shallow, rebuild);
    //   }
    // }

    return clone;
  }

  createDOMNode(n, deep=false) {
    let node = n.cloneNode(deep);

    return node;
  }

  findBreakToken(overflow, content) {
    let offset = overflow.startOffset;
    let node, renderedNode, ref, parent, index, temp, startOffset;

    if (overflow.startContainer.nodeType === 1) {
      // node = children.querySelector("[data-ref='" + overflow.startContainer.childNodes[offset].getAttribute("data-ref") + "']");
      temp = overflow.startContainer.childNodes[offset];

      if (temp.nodeType === 1) {
        ref = temp.getAttribute("data-ref");
        // node = this.parser.find(ref);
        renderedNode = this.wrapper.querySelector("[data-ref='" + ref + "']");
        node = content.querySelector("[data-ref='"+ renderedNode.getAttribute("data-ref") +"']");
        offset = 0;
      } else {
        index = Array.prototype.indexOf.call(overflow.startContainer.childNodes, temp);
        ref = overflow.startContainer.getAttribute("data-ref");
        renderedNode = this.wrapper.querySelector("[data-ref='" + ref + "']");
        parent = content.querySelector("[data-ref='"+ renderedNode.getAttribute("data-ref") +"']");
        node = parent.childNodes[index];
        offset = 0;
      }
    } else {
      index = Array.prototype.indexOf.call(overflow.startContainer.parentNode.childNodes, overflow.startContainer);
      // let parent = children.querySelector("[data-ref='" + overflow.startContainer.parentNode.getAttribute("data-ref") + "']");
      ref = overflow.startContainer.parentNode.getAttribute("data-ref");
      renderedNode = this.wrapper.querySelector("[data-ref='" + ref + "']");
      parent = content.querySelector("[data-ref='"+ renderedNode.getAttribute("data-ref") +"']");
      node = parent.childNodes[index];
      startOffset = overflow.startContainer.textContent.slice(offset);
      offset = parent.textContent.indexOf(startOffset);
    }

    if (!node) {
      return;
    }

    return {
      node,
      offset
    };

  }

  removeOverflow(overflow) {

    if (overflow.startContainer.nodeType === 3 && overflow.startOffset > 0) {
      let startText = overflow.startContainer.textContent;
      let startOffset = overflow.startOffset;
      let prevLetter = startText[startOffset-1];

      // Add a hyphen if previous character is a letter
      if (/^\w$/.test(prevLetter)) {
        overflow.startContainer.textContent = startText.slice(0, startOffset) + "\u2010";
        overflow.setStart(overflow.startContainer, startOffset + 1);
      }
    }


    // _requestIdleCallback(() => this.removeEmpty());
    return overflow.extractContents();
  }

  removeEmpty() {
    // Clean Empty Nodes
    let stack = stackChildren(this.wrapper);

    stack.forEach((currentNode) => {

      if (!currentNode) {
        return;
      }

      if (currentNode.childNodes.length === 0) {
        // Check in original
        let original = currentNode.getAttribute("data-children");
        if (original != 0) {
          currentNode.remove();
        }
      } else if (currentNode.textContent.trim().length === 0) {
        let original = currentNode.getAttribute("data-text");
        if (original != 0) {
          currentNode.remove();
        }
      }
    });

    stack = undefined;
    _requestIdleCallback(() => this.floats());

  }

  floats(area) {
    let bounds = getBoundingClientRect(this.element);

    let start = Math.round(bounds.left);
    let end = Math.round(bounds.right);

    let range;

    let walker = walk(this.wrapper.firstChild, this.wrapper);

    // Find Start
    let startContainer, startOffset;
    let next, done, node, offset;
    while (!done) {
      next = walker.next();
      done = next.done;
      node = next.value;

      if (node) {
        let pos = getBoundingClientRect(node);
        let left = Math.floor(pos.left);
        let right = Math.floor(pos.right);

        if (left >= end) {
          range = document.createRange();
          range.selectNode(node);
          // let extracted = range.extractContents();
          let extracted = this.removeOverflow(range);
          this._onOverflow && this._onOverflow(extracted);
        }

      }
    }

  }

  onEnter(node) {

  }

  onExit(node) {

  }

  onOverflow(func) {
    this._onOverflow = func;
  }

  onUnderflow(func) {
    this._onUnderflow = func;
  }

  overflow(area) {
    let bounds = getBoundingClientRect(this.element);

    let start = Math.round(bounds.left);
    let end =  Math.round(bounds.right);
    let range;

    let walker = walk(this.wrapper.firstChild, this.wrapper);

    // Find Start
    let startContainer, startOffset;
    let next, done, node, offset;
    while (!done) {
      next = walker.next();
      done = next.done;
      node = next.value;

      if (node) {
        let pos = getBoundingClientRect(node);
        let left = Math.floor(pos.left);
        let right = Math.floor(pos.right);

        if (!range && left >= end) {
          // Check if it is a float
          let isFloat = false;
          if (node.nodeType === 1) {
            let styles = window.getComputedStyle(node);
            isFloat = styles.getPropertyValue("float") !== "none";
          }

          if (!isFloat && node.nodeType === 1) {
            range = document.createRange();
            range.setStartBefore(node);
            break;
          }

          if (node.nodeType === 3 && node.textContent.trim().length) {
            range = document.createRange();
            range.setStartBefore(node);
            break;
          }

        }

        if (!range && node.nodeType === 3 && right > end && node.textContent.trim().length) {
          range = document.createRange();
          offset = this.textBreak(node, start, end);
          if (!offset) {
            range = undefined;
          } else {
            range.setStart(node, offset);
          }
          break;
        }

        // Skip children
        if (right < end) {

          next = nodeAfter(node, this.wrapper);
          if (next) {
            walker = walk(next, this.wrapper);
          }

        }

      }
    }
    if (range) {
      range.setEndAfter(this.wrapper.lastChild);

      this.hooks.overflow.trigger(range);

      return range;
    }

  }

  textBreak(node, start, end) {
    let wordwalker = this.words(node);
    let left = 0;
    let right = 0;
    let word, next, done, pos;
    let offset;
    while (!done) {
      next = wordwalker.next();
      word = next.value;
      done = next.done;

      if (!word) {
        break;
      }

      pos = getBoundingClientRect(word);

      left = Math.floor(pos.left);
      right = Math.floor(pos.right);

      if (left >= end) {
        offset = word.startOffset;
        break;
      }

      if (right > end) {
        let letterwalker = this.letters(word);
        let letter, nextLetter, doneLetter, posLetter;

        while (!doneLetter) {
          nextLetter = letterwalker.next();
          letter = nextLetter.value;
          doneLetter = nextLetter.done;

          if (!letter) {
            break;
          }

          pos = getBoundingClientRect(letter);
          left = Math.floor(pos.left);

          if (left >= end) {
            offset = letter.startOffset;
            done = true;

            break;
          }
        }
      }

    }

    return offset;
  }

  *words(node) {
    let currentText = node.nodeValue;
    let max = currentText.length;
    let currentOffset = 0;
    let currentLetter;

    let range;

    while(currentOffset < max) {
        currentLetter = currentText[currentOffset];
       if (/^\S$/.test(currentLetter)) {
         if (!range) {
           range = document.createRange();
           range.setStart(node, currentOffset);
         }
       } else {
         if (range) {
           range.setEnd(node, currentOffset);
           yield range;
           range = undefined;
         }
       }

       currentOffset += 1;
    }

    if (range) {
      range.setEnd(node, currentOffset);
      yield range;
      range = undefined;
    }
  }

  *letters(wordRange) {
    let currentText = wordRange.startContainer;
    let max = currentText.length;
    let currentOffset = wordRange.startOffset;
    let currentLetter;

    let range;

    while(currentOffset < max) {
       currentLetter = currentText[currentOffset];
       range = document.createRange();
       range.setStart(currentText, currentOffset);
       range.setEnd(currentText, currentOffset+1);

       yield range;

       currentOffset += 1;
    }
  }

  prepend(fragment, rebuild=true) {
    if (!fragment) {
      return;
    }
    let walker = walk(fragment.firstChild, this.wrapper);
    let next, node, done;
    let parent;
    while (!done) {
      next = walker.next();
      node = next.value;
      done = next.done;

      if (!node) {
        break;
      }

      let exists = false;

      if (node.nodeType === 1) {
        exists = this.wrapper.querySelector("[data-ref='" + node.getAttribute("data-ref") + "']");
      }

      if (exists) {
        parent = exists;
      } else {
        if(parent) {
          parent.insertBefore(node, parent.firstChild);
          break;
        } else {
          this.wrapper.insertBefore(node, this.wrapper.firstChild);
        }
      }
    }

    let hasOverflow = this.hasOverflow();

    if (hasOverflow) {

      let overflow = this.overflow(this.element);

      if (overflow) {
        // let extracted = overflow.extractContents();
        let extracted = this.removeOverflow(overflow);
        this._onOverflow && this._onOverflow(extracted);
      }
    }

    if (!this.listened) {
      this.listened = this.listeners();
    }
  }

  getOverflow() {
    let overflow = this.overflow(this.element);

    if (overflow) {
      // let extracted = overflow.extractContents();
      let extracted = this.removeOverflow(overflow);
      this._onOverflow && this._onOverflow(extracted);
    }
  }

  getUnderflow() {
    this._onUnderflow && this._onUnderflow();
  }

  listeners() {
    if (typeof ResizeObserver !== "undefined") {
      this.addResizeObserver();
    } else {
      this.element.addEventListener("overflow", this.getOverflow.bind(this), false);
      this.element.addEventListener("underflow", this.getUnderflow.bind(this), false);
    }
    // TODO: fall back to mutation observer?


    // Key scroll width from changing
    this.element.addEventListener("scroll", () => {
      this.element.scrollLeft = 0;
    });

    return true;
  }

  addResizeObserver() {
    let wrapper = this.wrapper;
    let prevHeight = wrapper.getBoundingClientRect().height;
    this.ro = new ResizeObserver( entries => {
      for (let entry of entries) {
        const cr = entry.contentRect;

        if (cr.height > prevHeight) {
          let hasOverflow = this.hasOverflow();

          if (hasOverflow) {

            let overflow = this.overflow(this.element);

            if (overflow) {
              // let extracted = overflow.extractContents();
              let extracted = this.removeOverflow(overflow);
              this._onOverflow && this._onOverflow(extracted);
              prevHeight = wrapper.getBoundingClientRect().height;
            }
          } else {
            prevHeight = cr.height;
          }

        } else if (cr.height < prevHeight ) { // TODO: calc line height && (prevHeight - cr.height) >= 22
          this._onUnderflow && this._onUnderflow();
          prevHeight = cr.height;
        }
      }
    });

    this.ro.observe(wrapper);
  }

  destroy() {
    this.element.removeEventListener("overflow", this.getOverflow.bind(this), false);
    this.element.removeEventListener("underflow", this.getUnderflow.bind(this), false);

    this.ro.disconnect();

    this.element = element;
    this.wrapper = wrapper;
  }

}

EventEmitter(Layout.prototype);

export default Layout;
