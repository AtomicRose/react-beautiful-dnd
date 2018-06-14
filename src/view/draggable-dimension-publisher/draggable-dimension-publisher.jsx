// @flow
import { Component, type Node } from 'react';
import PropTypes from 'prop-types';
import memoizeOne from 'memoize-one';
import invariant from 'tiny-invariant';
import { calculateBox, withScroll, getBox, offset, type BoxModel, type Position } from 'css-box-model';
import { negate, subtract, add } from '../../state/position';
import { dimensionMarshalKey } from '../context-keys';
import type {
  DraggableDescriptor,
  DraggableDimension,
  Placeholder,
  DraggableId,
  DroppableId,
  TypeId,
  BoxSizing,
} from '../../types';
import type { DimensionMarshal } from '../../state/dimension-marshal/dimension-marshal-types';

type Props = {|
  draggableId: DraggableId,
  droppableId: DroppableId,
  type: TypeId,
  index: number,
  isDragging: boolean,
  offset: Position,
  getDraggableRef: () => ?HTMLElement,
  children: Node,
|}

export default class DraggableDimensionPublisher extends Component<Props> {
  /* eslint-disable react/sort-comp */
  static contextTypes = {
    [dimensionMarshalKey]: PropTypes.object.isRequired,
  };

  publishedDescriptor: ?DraggableDescriptor = null

  componentDidMount() {
    this.publish();
  }

  componentDidUpdate() {
    this.publish();
  }

  componentWillUnmount() {
    this.unpublish();
  }

  getMemoizedDescriptor = memoizeOne((
    id: DraggableId,
    index: number,
    droppableId: DroppableId,
    type: TypeId
  ): DraggableDescriptor => ({
    id, index, droppableId, type,
  }));

  publish = () => {
    const marshal: DimensionMarshal = this.context[dimensionMarshalKey];
    const descriptor: DraggableDescriptor = this.getMemoizedDescriptor(
      this.props.draggableId,
      this.props.index,
      this.props.droppableId,
      this.props.type,
    );

    if (!this.publishedDescriptor) {
      marshal.registerDraggable(descriptor, this.getDimension);
      this.publishedDescriptor = descriptor;
      return;
    }

    // No changes to the descriptor
    if (descriptor === this.publishedDescriptor) {
      return;
    }

    marshal.updateDraggable(this.publishedDescriptor, descriptor, this.getDimension);
    this.publishedDescriptor = descriptor;
  }

  unpublish = () => {
    if (!this.publishedDescriptor) {
      console.error('cannot unpublish descriptor when none is published');
      return;
    }

    // Using the previously published id to unpublish. This is to guard
    // against the case where the id dynamically changes. This is not
    // supported during a drag - but it is good to guard against.
    const marshal: DimensionMarshal = this.context[dimensionMarshalKey];
    marshal.unregisterDraggable(this.publishedDescriptor);
    this.publishedDescriptor = null;
  }

  getDimension = (windowScroll: Position, windowScrollDiff: Position): DraggableDimension => {
    const targetRef: ?HTMLElement = this.props.getDraggableRef();
    const descriptor: ?DraggableDescriptor = this.publishedDescriptor;

    invariant(targetRef, 'DraggableDimensionPublisher cannot calculate a dimension when not attached to the DOM');
    invariant(descriptor, 'Cannot get dimension for unpublished draggable');

    const computedStyles: CSSStyleDeclaration = window.getComputedStyle(targetRef);
    const borderBox: ClientRect = targetRef.getBoundingClientRect();

    // We do not need to fast forward any transitions as the style marshal will
    // do that for us before a collection
    const change: Position = (() => {
      const { isDragging, offset: shift } = this.props;
      const undoTransform: Position = negate(shift);
      if (!isDragging) {
        return undoTransform;
      }

      // When dragging, position: fixed will avoid any client changes based on scroll.
      // We are manually applying these client changes based on the change in window scroll
      // from when the drag started
      const undoWindowScroll: Position = negate(windowScrollDiff);

      console.log('offseting dragging item by', add(undoTransform, undoWindowScroll));

      return add(undoTransform, undoWindowScroll);
    })();

    const box: BoxModel = calculateBox(borderBox, computedStyles);
    const client: BoxModel = offset(box, change);
    const page: BoxModel = withScroll(client, windowScroll);

    const boxSizing: BoxSizing = computedStyles.boxSizing === 'border-box' ? 'border-box' : 'content-box';

    const placeholder: Placeholder = {
      client,
      tagName: targetRef.tagName.toLowerCase(),
      display: computedStyles.display,
      boxSizing,
    };

    const dimension: DraggableDimension = {
      descriptor,
      boxSizing,
      placeholder,
      client,
      page,
    };

    return dimension;
  }

  render() {
    return this.props.children;
  }
}

