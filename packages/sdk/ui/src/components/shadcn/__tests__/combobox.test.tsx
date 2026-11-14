import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from '../combobox.js';

describe('Combobox accessible labels', () => {
  it('uses its configured listbox label and empty text', () => {
    render(
      <Combobox
        options={[]}
        value={null}
        onChange={() => {}}
        placeholder="Choose an option"
        listboxLabel="Available options"
        emptyText="No matching options"
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox', { name: 'Available options' })).toBeInTheDocument();
    expect(screen.getByText('No matching options')).toBeInTheDocument();
  });
});

describe('Combobox filterOptions (#821 fix1)', () => {
  const OPTIONS = [
    { value: 'voc-12', label: 'VOC-12 · 로그인 오류' },
    { value: 'voc-13', label: 'VOC-13 · 결제 화면이 느림' },
  ];

  it('with filterOptions={false}, an option whose label does not contain the typed text is still listed', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        filterOptions={false}
        listboxLabel="옵션"
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('검색…'), { target: { value: ' voc-12 ' } });

    // The padded search matches no label substring; the server-searched row
    // must still be listed exactly as returned.
    expect(screen.getByRole('option', { name: 'VOC-12 · 로그인 오류' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'VOC-13 · 결제 화면이 느림' })).toBeInTheDocument();
  });

  it('defaults to client-filtering option labels by the typed search', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} listboxLabel="옵션" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('검색…'), { target: { value: ' voc-12 ' } });

    expect(screen.queryByRole('option', { name: 'VOC-12 · 로그인 오류' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'VOC-13 · 결제 화면이 느림' }),
    ).not.toBeInTheDocument();
  });
});

it('shows a selected label outside the current page and owns loading/more controls (#2028 SHE-17)', () => {
  const load = vi.fn();
  const view = render(<Combobox options={[]} value="saved" getLabel={() => 'Saved label'} onChange={() => {}} hasMore onLoadMore={load} moreLabel="More" loadingText="Loading" />);
  expect(screen.getByRole('combobox')).toHaveTextContent('Saved label');
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  expect(load).toHaveBeenCalledOnce();
  view.rerender(<Combobox options={[]} value="saved" getLabel={() => 'Saved label'} onChange={() => {}} hasMore onLoadMore={load} loading loadingText="Loading" />);
  expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
});

// #2215: the Enter that confirms a Korean composition is not a selection (useImeEnterGuard).
describe('Combobox IME Enter guard (#2215)', () => {
  const OPTIONS = [{ value: 'a', label: '가나' }, { value: 'b', label: '다라' }];
  function openSearch(onChange: (value: string) => void) {
    render(<Combobox options={OPTIONS} value={null} onChange={onChange} listboxLabel="옵션" />);
    fireEvent.click(screen.getByRole('combobox'));
    const search = screen.getByPlaceholderText('검색…');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    return search;
  }
  function enter(target: HTMLElement, init: { isComposing?: boolean; keyCode?: number } = {}) {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: init.isComposing === true });
    if (init.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: init.keyCode });
    fireEvent(target, event);
  }

  it.each([
    ['isComposing', { isComposing: true }],
    ['keyCode 229', { keyCode: 229 }],
  ])('does not select on a composition Enter (%s), and the next plain Enter selects', (_label, init) => {
    const onChange = vi.fn();
    const search = openSearch(onChange);
    enter(search, init);
    expect(onChange).not.toHaveBeenCalled();
    enter(search);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not select on the Enter Safari sends right after compositionend', () => {
    const onChange = vi.fn();
    const search = openSearch(onChange);
    fireEvent.compositionStart(search);
    fireEvent.compositionEnd(search);
    enter(search);
    expect(onChange).not.toHaveBeenCalled();
    enter(search);
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
