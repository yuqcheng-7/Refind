#!/usr/bin/env python3
from __future__ import annotations

import base64
import unittest
from unittest import mock

from office_convert import ALLOWED_EXTENSIONS, convert_office_to_pdf, resolve_soffice


class OfficeConvertTests(unittest.TestCase):
  def test_rejects_unsupported_extension(self):
    with self.assertRaises(ValueError):
      convert_office_to_pdf("notes.txt", b"hello")

  def test_rejects_empty_payload(self):
    with self.assertRaises(ValueError):
      convert_office_to_pdf("deck.pptx", b"")

  def test_requires_soffice(self):
    with mock.patch("office_convert.resolve_soffice", return_value=None):
      with self.assertRaises(RuntimeError):
        convert_office_to_pdf("deck.pptx", b"PK\x03\x04fake")

  def test_allowed_extensions_cover_office(self):
    self.assertIn(".pptx", ALLOWED_EXTENSIONS)
    self.assertIn(".xlsx", ALLOWED_EXTENSIONS)

  def test_resolve_soffice_tolerates_missing(self):
    # Just ensure function runs; may or may not find soffice on CI.
    result = resolve_soffice()
    self.assertTrue(result is None or isinstance(result, str))


if __name__ == "__main__":
  unittest.main()
